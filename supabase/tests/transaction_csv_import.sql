-- Run against a disposable/local database after migrations, as postgres.
-- psql -v ON_ERROR_STOP=1 -f supabase/tests/transaction_csv_import.sql
-- Fixtures and all imported rows are rolled back. No pgTAP dependency.
begin;

insert into auth.users(id) values
  ('94000000-0000-0000-0000-000000000001'),
  ('94000000-0000-0000-0000-000000000002'),
  ('94000000-0000-0000-0000-000000000003');
insert into public.ledgers(id, name, owner_id) values
  ('94100000-0000-0000-0000-000000000001', 'CSV test', '94000000-0000-0000-0000-000000000001'),
  ('94100000-0000-0000-0000-000000000002', 'Other CSV test', '94000000-0000-0000-0000-000000000003');
insert into public.ledger_members(ledger_id, user_id, role) values
  ('94100000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000001', 'owner'),
  ('94100000-0000-0000-0000-000000000001', '94000000-0000-0000-0000-000000000002', 'viewer');
insert into public.categories(id, ledger_id, name, type, is_active) values
  ('94200000-0000-0000-0000-000000000001', '94100000-0000-0000-0000-000000000001', '식비', 'expense', true),
  ('94200000-0000-0000-0000-000000000002', '94100000-0000-0000-0000-000000000001', '비활성', 'expense', false),
  ('94200000-0000-0000-0000-000000000003', '94100000-0000-0000-0000-000000000002', '다른 가계부', 'expense', true);

select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
declare
  ledger constant uuid := '94100000-0000-0000-0000-000000000001';
  request constant uuid := '94300000-0000-0000-0000-000000000001';
  row_value jsonb := '{"categoryId":"94200000-0000-0000-0000-000000000001","type":"expense","txnDate":"2024-02-29","amount":12000,"memo":"점심"}';
  bad jsonb;
  payload jsonb;
  before_count integer;
  after_count integer;
begin
  if public.import_transactions(ledger, request, jsonb_build_array(row_value)) <> 1 then
    raise exception 'valid import did not report 1';
  end if;
  -- A lost response / same request is a no-op, even if its rows were later edited.
  if public.import_transactions(ledger, request, jsonb_build_array(row_value)) <> 1 then
    raise exception 'retry did not report original count';
  end if;
  select count(*) into before_count from public.transactions where ledger_id = ledger;
  if before_count <> 1 then raise exception 'retry duplicated transactions'; end if;
  begin
    perform public.import_transactions(ledger, request, jsonb_build_array(row_value || '{"amount":99}'));
    raise exception 'changed payload accepted with same request id';
  exception when invalid_parameter_value then null;
  end;

  -- Each invalid second row must roll back the valid first row and request record.
  for bad in select value from jsonb_array_elements(jsonb_build_array(
    row_value || '{"txnDate":"2026-02-29"}',
    row_value || '{"txnDate":"2026-04-31"}',
    row_value || '{"txnDate":"0000-01-01"}',
    row_value || '{"txnDate":"2026-1-01"}',
    row_value || '{"amount":0}',
    row_value || '{"amount":-1}',
    row_value || '{"amount":1.5}',
    row_value || '{"amount":"100"}',
    row_value || '{"amount":9007199254740992}',
    row_value || '{"amount":null}',
    row_value || jsonb_build_object('memo', repeat('😀', 201)),
    row_value || jsonb_build_object('memo', chr(1)),
    row_value || '{"memo":false}',
    row_value || '{"extra":"unknown"}',
    row_value - 'memo',
    row_value || '{"type":"income"}',
    row_value || '{"type":"other"}',
    row_value || '{"categoryId":"94200000-0000-0000-0000-000000000002"}',
    row_value || '{"categoryId":"94200000-0000-0000-0000-000000000003"}',
    'null'::jsonb,
    '[]'::jsonb
  )) loop
    begin
      perform public.import_transactions(ledger, gen_random_uuid(), jsonb_build_array(row_value, bad));
      raise exception 'invalid row was accepted: %', bad;
    exception when invalid_parameter_value or check_violation then null;
    end;
    select count(*) into after_count from public.transactions where ledger_id = ledger;
    if after_count <> before_count then raise exception 'partial insert survived rollback'; end if;
  end loop;

  -- Request-level limits and shape.
  for payload in select value from jsonb_array_elements(jsonb_build_array(
    'null'::jsonb, '{}'::jsonb, '[]'::jsonb,
    (select jsonb_agg(row_value) from generate_series(1, 501))
  )) loop
    begin
      perform public.import_transactions(ledger, gen_random_uuid(), payload);
      raise exception 'invalid request was accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;

  -- Maximum safe integer, Unicode codepoint length, and allowed newline/tab memo.
  perform public.import_transactions(ledger, gen_random_uuid(), jsonb_build_array(
    row_value || jsonb_build_object('amount', 9007199254740991, 'memo', repeat('😀', 200)),
    row_value || jsonb_build_object('txnDate', '0001-01-01', 'memo', E'line\nnext\tcell'),
    row_value || '{"txnDate":"9999-12-31"}'
  ));
end $$;

-- A viewer and an unrelated user cannot import.
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000002', true);
do $$ begin
  perform public.import_transactions('94100000-0000-0000-0000-000000000001', gen_random_uuid(), '[]');
  raise exception 'viewer imported';
exception when insufficient_privilege then null;
end $$;
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000003', true);
do $$ begin
  perform public.import_transactions('94100000-0000-0000-0000-000000000001', gen_random_uuid(), '[]');
  raise exception 'nonmember imported';
exception when insufficient_privilege then null;
end $$;

-- Bookkeeping cannot be read or forged directly, even by the owner.
select set_config('request.jwt.claim.sub', '94000000-0000-0000-0000-000000000001', true);
do $$ begin
  perform * from public.transaction_imports;
  raise exception 'bookkeeping exposed';
exception when insufficient_privilege then null;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon', 'public.import_transactions(uuid,uuid,jsonb)', 'EXECUTE') then
    raise exception 'anonymous execution allowed';
  end if;
  if (select count(*) from public.transaction_imports where ledger_id = '94100000-0000-0000-0000-000000000001') <> 2 then
    raise exception 'failed request bookkeeping survived rollback';
  end if;
end $$;

rollback;
