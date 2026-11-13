-- Atomic CSV import. A committed request can be safely retried after a lost response.
-- Rollback (after disabling the UI): drop function public.import_transactions(uuid, uuid, jsonb);
-- drop table public.transaction_imports; imported transactions remain intact.
create table public.transaction_imports (
  ledger_id uuid not null references public.ledgers(id) on delete cascade,
  request_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  payload_hash bytea not null,
  row_count integer not null check (row_count between 1 and 500),
  created_at timestamptz not null default now(),
  primary key (ledger_id, request_id)
);
create index transaction_imports_user_idx on public.transaction_imports(user_id);
alter table public.transaction_imports enable row level security;
-- Only the RPC owns this bookkeeping. No direct API read/write policy or grant.
revoke all on public.transaction_imports from public, anon, authenticated;

create function public.import_transactions(p_ledger uuid, p_request_id uuid, p_rows jsonb)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_count integer;
  v_inserted integer;
  v_hash bytea;
  v_prior public.transaction_imports%rowtype;
  v_row jsonb;
  v_date date;
  v_category public.categories%rowtype;
begin
  if auth.uid() is null or not public.is_ledger_member(p_ledger, 'editor') then
    raise exception '이 작업을 수행할 권한이 없습니다.' using errcode = '42501';
  end if;
  if p_request_id is null or jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception '등록 요청 형식이 올바르지 않습니다.' using errcode = '22023';
  end if;
  v_count := jsonb_array_length(p_rows);
  if v_count < 1 or v_count > 500 or octet_length(p_rows::text) > 1048576 then
    raise exception '한 번에 1~500건, 1MiB 이하만 등록할 수 있습니다.' using errcode = '22023';
  end if;
  v_hash := sha256(convert_to(p_rows::text, 'UTF8'));
  -- ON CONFLICT waits for a concurrent retry. Failure rolls back this reservation too.
  insert into public.transaction_imports(ledger_id, request_id, user_id, payload_hash, row_count)
    values (p_ledger, p_request_id, auth.uid(), v_hash, v_count)
    on conflict do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 0 then
    select * into strict v_prior from public.transaction_imports
      where ledger_id = p_ledger and request_id = p_request_id;
    if v_prior.user_id <> auth.uid() or v_prior.payload_hash <> v_hash then
      raise exception '이미 사용한 요청 번호입니다. 파일을 다시 검증하세요.' using errcode = '22023';
    end if;
    return v_prior.row_count;
  end if;

  for v_row in select value from jsonb_array_elements(p_rows) loop
    if jsonb_typeof(v_row) is distinct from 'object' then
      raise exception '거래 형식이 올바르지 않습니다.' using errcode = '22023';
    end if;
    if not (v_row ?& array['categoryId', 'type', 'txnDate', 'amount', 'memo'])
       or (v_row - array['categoryId', 'type', 'txnDate', 'amount', 'memo']) <> '{}'::jsonb
       or jsonb_typeof(v_row->'categoryId') is distinct from 'string'
       or jsonb_typeof(v_row->'type') is distinct from 'string'
       or (v_row->>'type') not in ('income', 'expense', 'saving', 'investment')
       or jsonb_typeof(v_row->'txnDate') is distinct from 'string'
       or (v_row->>'txnDate') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
       or jsonb_typeof(v_row->'amount') is distinct from 'number'
       or (v_row->>'amount') !~ '^[0-9]+$'
       or jsonb_typeof(v_row->'memo') not in ('string', 'null') then
      raise exception '거래의 필수 값 또는 형식이 올바르지 않습니다.' using errcode = '22023';
    end if;
    if (v_row->>'amount')::numeric not between 1 and 9007199254740991
       or length(v_row->>'memo') > 200
       or (v_row->>'memo') ~ '[\x01-\x08\x0B\x0C\x0E-\x1F\x7F]' then
      raise exception '금액 또는 메모가 허용 범위를 벗어났습니다.' using errcode = '22023';
    end if;
    begin
      v_date := (v_row->>'txnDate')::date;
      if to_char(v_date, 'YYYY-MM-DD') <> v_row->>'txnDate' then
        raise exception 'invalid date';
      end if;
    exception when others then
      raise exception '실제 존재하는 날짜를 YYYY-MM-DD로 입력하세요.' using errcode = '22023';
    end;
    -- Lock the category until commit: concurrent rename/deactivation cannot invalidate this write.
    select * into v_category from public.categories
      where id = (v_row->>'categoryId')::uuid and ledger_id = p_ledger for share;
    if not found or not v_category.is_active or v_category.type::text <> v_row->>'type' then
      raise exception '카테고리가 변경되었거나 구분과 맞지 않습니다. 파일을 다시 검증하세요.' using errcode = '23514';
    end if;
    insert into public.transactions(ledger_id, category_id, type, txn_date, amount, memo, source)
      values (p_ledger, v_category.id, v_category.type, v_date, (v_row->>'amount')::bigint,
        nullif(btrim(v_row->>'memo'), ''), 'manual');
  end loop;
  return v_count;
end;
$$;
revoke all on function public.import_transactions(uuid, uuid, jsonb) from public, anon;
grant execute on function public.import_transactions(uuid, uuid, jsonb) to authenticated;
