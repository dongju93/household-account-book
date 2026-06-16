-- Per-category opt-in for the daily budget-pace hint on 달성 확인 (지출 only).
alter table categories
add column show_budget_pace boolean not null default false;

alter table categories add constraint pace_only_expense check (
  show_budget_pace = false
  or type = 'expense'
);