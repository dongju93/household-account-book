-- 0005_materialize_recurring.sql
-- Materialize-on-view: when a month is opened, insert one real transaction per
-- active recurring item valid for that month. Idempotent via the partial unique
-- index on (recurring_id, occurrence_month); skipped occurrences are not revived.
--
-- SECURITY INVOKER (default) so RLS still applies: the explicit editor check
-- means viewers get a no-op (return 0) instead of an error.

create or replace function materialize_recurring(p_ledger uuid, p_month date)
returns integer
language plpgsql
as $$
declare
  m date := date_trunc('month', p_month)::date;  -- normalize to first-of-month
  n integer;
begin
  if not is_ledger_member(p_ledger, 'editor') then
    return 0;
  end if;

  insert into transactions
    (ledger_id, category_id, txn_date, type, amount, memo,
     source, recurring_id, occurrence_month)
  select
    r.ledger_id,
    r.category_id,
    -- clamp day_of_month to the month's last day (e.g. 31 -> 28/29 in Feb)
    (m - 1) + least(
      r.day_of_month,
      extract(day from (m + interval '1 month - 1 day'))::int
    ),
    r.type,
    r.amount,
    r.memo,
    'recurring',
    r.id,
    m
  from recurring_items r
  where r.ledger_id = p_ledger
    and r.is_active
    and r.start_month <= m
    and (r.end_month is null or r.end_month >= m)
    and not exists (
      select 1 from recurring_skips s
      where s.recurring_id = r.id and s.occurrence_month = m
    )
  on conflict (recurring_id, occurrence_month) where source = 'recurring'
    do nothing;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function materialize_recurring(uuid, date) from public;
grant execute on function materialize_recurring(uuid, date) to authenticated;
