-- 0010_index_improvements.sql
-- Four targeted indexes identified by pg hypertable-candidate analysis.
-- All are additive (no table or column changes); safe to apply on a live DB.
-- 1. Covering index for is_ledger_member() — called on every RLS policy check
--    across all six app tables. Adding `role` makes the lookup index-only,
--    eliminating heap fetches on the hottest function in the schema.
create index ledger_members_ledger_user_role_idx on ledger_members (ledger_id, user_id, role);

-- 2. Fund-type aggregations for the reports page and dashboard type breakdowns.
--    The existing (ledger_id, txn_date desc, id desc) index cannot satisfy
--    queries that also filter or group by `type` without a full ledger scan.
create index transactions_ledger_type_date_idx on transactions (ledger_id, type, txn_date desc);

-- 3. materialize_recurring() filters active items by ledger + month window
--    (start_month <= m AND (end_month IS NULL OR end_month >= m)). The current
--    recurring_active_idx covers only ledger_id; adding start_month brings
--    the month-window check into the index without touching inactive rows.
create index recurring_active_range_idx on recurring_items (ledger_id, start_month)
where
  is_active;

-- 4. sync_recurring_forward() and purge_recurring_forward() filter by
--    (recurring_id, occurrence_month >= today) on the recurring subset.
--    The existing transactions_recurring_occurrence unique index is used for
--    ON CONFLICT (equality); this separate index serves the range path
--    (UPDATE / DELETE WHERE occurrence_month >= today).
create index transactions_recurring_month_idx on transactions (recurring_id, occurrence_month)
where
  source = 'recurring';