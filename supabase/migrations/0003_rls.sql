-- 0003_rls.sql
-- Row Level Security is a hard requirement (spec §9): every app table has RLS
-- enabled and a policy set. Access is gated by ledger membership + role.

-- ── Membership helper (recursion-safe) ───────────────────────────────────────
-- SECURITY DEFINER makes the internal read of ledger_members bypass RLS, which
-- is what breaks the self-reference recursion when ledger_members' own policies
-- call this function. search_path is locked for safety.
create or replace function is_ledger_member(p_ledger uuid, p_min_role member_role)
returns boolean
language sql
stable
security definer
set search_path = public, auth
as $$
  select exists (
    select 1
    from ledger_members m
    where m.ledger_id = p_ledger
      and m.user_id = auth.uid()
      and case p_min_role
            when 'viewer' then true
            when 'editor' then m.role in ('owner', 'editor')
            when 'owner'  then m.role = 'owner'
          end
  );
$$;
revoke all on function is_ledger_member(uuid, member_role) from public;
grant execute on function is_ledger_member(uuid, member_role) to authenticated;

-- ── Enable RLS on every app table ────────────────────────────────────────────
alter table ledgers         enable row level security;
alter table ledger_members  enable row level security;
alter table categories      enable row level security;
alter table recurring_items enable row level security;
alter table transactions    enable row level security;
alter table recurring_skips enable row level security;

-- ── ledger_members ───────────────────────────────────────────────────────────
-- Non-recursive thanks to the SECURITY DEFINER helper.
create policy lm_select on ledger_members for select to authenticated
  using (is_ledger_member(ledger_id, 'viewer'));
create policy lm_owner_write on ledger_members for all to authenticated
  using (is_ledger_member(ledger_id, 'owner'))
  with check (is_ledger_member(ledger_id, 'owner'));

-- ── ledgers ──────────────────────────────────────────────────────────────────
create policy l_select on ledgers for select to authenticated
  using (is_ledger_member(id, 'viewer'));
-- bootstrap fallback for client-initiated ledger creation (owner = caller)
create policy l_insert on ledgers for insert to authenticated
  with check (owner_id = auth.uid());
create policy l_update on ledgers for update to authenticated
  using (is_ledger_member(id, 'owner'))
  with check (is_ledger_member(id, 'owner'));
create policy l_delete on ledgers for delete to authenticated
  using (is_ledger_member(id, 'owner'));

-- ── categories (settings → owner writes) ─────────────────────────────────────
create policy c_select on categories for select to authenticated
  using (is_ledger_member(ledger_id, 'viewer'));
create policy c_write on categories for all to authenticated
  using (is_ledger_member(ledger_id, 'owner'))
  with check (is_ledger_member(ledger_id, 'owner'));

-- ── recurring_items (editor writes) ──────────────────────────────────────────
create policy r_select on recurring_items for select to authenticated
  using (is_ledger_member(ledger_id, 'viewer'));
create policy r_write on recurring_items for all to authenticated
  using (is_ledger_member(ledger_id, 'editor'))
  with check (is_ledger_member(ledger_id, 'editor'));

-- ── transactions (editor writes) ─────────────────────────────────────────────
create policy t_select on transactions for select to authenticated
  using (is_ledger_member(ledger_id, 'viewer'));
create policy t_write on transactions for all to authenticated
  using (is_ledger_member(ledger_id, 'editor'))
  with check (is_ledger_member(ledger_id, 'editor'));

-- ── recurring_skips (editor writes) ──────────────────────────────────────────
create policy rs_select on recurring_skips for select to authenticated
  using (is_ledger_member(ledger_id, 'viewer'));
create policy rs_write on recurring_skips for all to authenticated
  using (is_ledger_member(ledger_id, 'editor'))
  with check (is_ledger_member(ledger_id, 'editor'));
