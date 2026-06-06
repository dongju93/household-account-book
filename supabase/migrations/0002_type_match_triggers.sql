-- 0002_type_match_triggers.sql
-- The rule "row.type must equal its category's type" spans two tables, so a
-- CHECK constraint cannot express it. Enforce it with BEFORE INSERT/UPDATE
-- triggers — the DB-side source of truth that mirrors domain/validation.ts.
-- Also verifies the category belongs to the same ledger (defense in depth).

create or replace function assert_type_matches_category() returns trigger
language plpgsql as $$
declare
  cat_type   fund_type;
  cat_ledger uuid;
begin
  select type, ledger_id into cat_type, cat_ledger
    from categories where id = new.category_id;

  if cat_type is null then
    raise exception 'category % not found', new.category_id;
  end if;
  if cat_type <> new.type then
    raise exception 'type % does not match category type %', new.type, cat_type
      using errcode = 'check_violation';
  end if;
  if cat_ledger <> new.ledger_id then
    raise exception 'category belongs to a different ledger'
      using errcode = 'check_violation';
  end if;
  return new;
end $$;

create trigger trg_txn_type_match
  before insert or update on transactions
  for each row execute function assert_type_matches_category();

create trigger trg_recurring_type_match
  before insert or update on recurring_items
  for each row execute function assert_type_matches_category();
