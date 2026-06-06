-- 0007_purge_recurring_forward.sql
-- When a recurring item is disabled, delete all materialized transactions for
-- the current month and any future months. Past months are intentionally
-- excluded to preserve historical data integrity — the same boundary used by
-- sync_recurring_forward (0006).
--
-- Re-enabling an item does NOT auto-resurrect rows; materialize_recurring will
-- fill the gap the next time an affected month is opened.

create or replace function purge_recurring_forward(p_ledger uuid, p_recurring_id uuid)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  today date := date_trunc('month', current_date)::date;
  n integer;
begin
  if not is_ledger_member(p_ledger, 'editor') then
    return 0;
  end if;

  delete from transactions t
  where t.recurring_id     = p_recurring_id
    and t.ledger_id        = p_ledger
    and t.source           = 'recurring'
    and t.occurrence_month >= today;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function purge_recurring_forward(uuid, uuid) from public;
grant execute on function purge_recurring_forward(uuid, uuid) to authenticated;
