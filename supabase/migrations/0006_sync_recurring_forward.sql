-- 0006_sync_recurring_forward.sql
-- When a recurring item is edited, propagate the new field values to all already-
-- materialized transactions for the current month and any future months.
-- Past months are intentionally excluded to preserve historical data integrity.

create or replace function sync_recurring_forward(p_ledger uuid, p_recurring_id uuid)
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

  update transactions t
  set
    category_id      = r.category_id,
    type             = r.type,
    amount           = r.amount,
    memo             = r.memo,
    -- recalculate txn_date using the same day-clamping formula as materialize_recurring
    txn_date         = (t.occurrence_month - 1) + least(
                         r.day_of_month,
                         extract(day from (t.occurrence_month + interval '1 month - 1 day'))::int
                       ),
    updated_at       = now()
  from recurring_items r
  where r.id             = p_recurring_id
    and r.ledger_id      = p_ledger
    and t.recurring_id   = r.id
    and t.source         = 'recurring'
    and t.occurrence_month >= today;

  get diagnostics n = row_count;
  return n;
end $$;

revoke all on function sync_recurring_forward(uuid, uuid) from public;
grant execute on function sync_recurring_forward(uuid, uuid) to authenticated;
