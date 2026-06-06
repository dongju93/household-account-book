-- 0004_signup_trigger.sql
-- On signup, create the user's personal ledger + owner membership and a starter
-- set of categories. SECURITY DEFINER bypasses RLS so the brand-new user (who is
-- not yet a member of anything) can be bootstrapped without a chicken-and-egg.

create or replace function handle_new_user() returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  new_ledger uuid;
begin
  insert into ledgers (name, owner_id)
    values ('내 가계부', new.id)
    returning id into new_ledger;

  insert into ledger_members (ledger_id, user_id, role)
    values (new_ledger, new.id, 'owner');

  -- Starter categories (mirrors the wireframe sample). Budgets/goals start unset
  -- so the user defines their own targets in 설정.
  insert into categories (ledger_id, name, type, sort_order) values
    (new_ledger, '월급', 'income',     0),
    (new_ledger, '식비', 'expense',    1),
    (new_ledger, '카페', 'expense',    2),
    (new_ledger, '생활', 'expense',    3),
    (new_ledger, '교통', 'expense',    4),
    (new_ledger, '비상금', 'saving',   5),
    (new_ledger, '투자', 'investment', 6);

  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
