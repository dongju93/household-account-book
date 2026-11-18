-- Global targets stay on categories. A month row retains its custom amount
-- even while source = 'global'; switching back never destroys the saved draft.
alter table public.categories
  add constraint categories_ledger_id_type_unique unique (ledger_id, id, type);

create table public.category_month_targets (
  ledger_id uuid not null,
  category_id uuid not null,
  type public.fund_type not null check (type in ('expense', 'saving')),
  month date not null check (
    month between date '0001-01-01' and date '9999-12-01' and extract(day from month) = 1
  ),
  source text not null check (source in ('global', 'custom')),
  custom_amount bigint not null check (custom_amount between 0 and 9007199254740991),
  updated_at timestamptz not null default now(),
  primary key (ledger_id, month, category_id),
  foreign key (ledger_id, category_id, type)
    references public.categories (ledger_id, id, type) on delete cascade
);

create index category_month_targets_category_idx
  on public.category_month_targets (ledger_id, category_id, type);

create trigger trg_category_month_targets_updated before update on public.category_month_targets
  for each row execute function public.set_updated_at();

alter table public.category_month_targets enable row level security;
create policy cmt_select on public.category_month_targets for select to authenticated
  using (public.is_ledger_member(ledger_id, 'viewer'));
create policy cmt_write on public.category_month_targets for all to authenticated
  using (public.is_ledger_member(ledger_id, 'owner'))
  with check (public.is_ledger_member(ledger_id, 'owner'));

revoke all on public.category_month_targets from public, anon;
grant select, insert, update, delete on public.category_month_targets to authenticated;

-- Explicit permission check also covers switching to global when no row exists:
-- an RLS-filtered UPDATE alone would otherwise look like a successful save.
create function public.set_category_month_target(
  p_ledger uuid,
  p_category uuid,
  p_month date,
  p_source text,
  p_custom_amount bigint default null
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_type public.fund_type;
begin
  if not public.is_ledger_member(p_ledger, 'owner') then
    raise exception 'Only ledger owners may change monthly targets' using errcode = '42501';
  end if;
  if p_month is null or p_month not between date '0001-01-01' and date '9999-12-01'
    or extract(day from p_month) <> 1
    or p_source is null or p_source not in ('global', 'custom') then
    raise exception 'Invalid month or source' using errcode = '22023';
  end if;
  select c.type into v_type from public.categories c
    where c.ledger_id = p_ledger and c.id = p_category and c.type in ('expense', 'saving');
  if not found then
    raise exception 'Invalid target category' using errcode = '22023';
  end if;

  if p_source = 'global' then
    update public.category_month_targets set source = 'global'
      where ledger_id = p_ledger and category_id = p_category and month = p_month;
  else
    insert into public.category_month_targets
      (ledger_id, category_id, type, month, source, custom_amount)
      values (p_ledger, p_category, v_type, p_month, 'custom', p_custom_amount)
      on conflict (ledger_id, month, category_id) do update
        set source = 'custom', custom_amount = excluded.custom_amount;
  end if;
end;
$$;
revoke all on function public.set_category_month_target(uuid, uuid, date, text, bigint) from public, anon;
grant execute on function public.set_category_month_target(uuid, uuid, date, text, bigint) to authenticated;
