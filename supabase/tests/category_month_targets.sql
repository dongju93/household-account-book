-- Run after migrations on a disposable database as postgres. No pgTAP needed.
begin;

insert into auth.users(id) values
  ('95000000-0000-0000-0000-000000000001'),
  ('95000000-0000-0000-0000-000000000002'),
  ('95000000-0000-0000-0000-000000000003'),
  ('95000000-0000-0000-0000-000000000004');
insert into public.ledgers(id, name, owner_id) values
  ('95100000-0000-0000-0000-000000000001', 'Monthly test', '95000000-0000-0000-0000-000000000001'),
  ('95100000-0000-0000-0000-000000000002', 'Other monthly test', '95000000-0000-0000-0000-000000000004');
insert into public.ledger_members(ledger_id, user_id, role) values
  ('95100000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000001', 'owner'),
  ('95100000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000002', 'editor'),
  ('95100000-0000-0000-0000-000000000001', '95000000-0000-0000-0000-000000000003', 'viewer');
insert into public.categories(id, ledger_id, name, type, budget_amount, goal_amount) values
  ('95200000-0000-0000-0000-000000000001', '95100000-0000-0000-0000-000000000001', '식비', 'expense', 500000, null),
  ('95200000-0000-0000-0000-000000000002', '95100000-0000-0000-0000-000000000001', '비상금', 'saving', null, 1000000),
  ('95200000-0000-0000-0000-000000000003', '95100000-0000-0000-0000-000000000001', '급여', 'income', null, null),
  ('95200000-0000-0000-0000-000000000004', '95100000-0000-0000-0000-000000000002', '다른 가계부 식비', 'expense', 1, null);

select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$
declare
  ledger constant uuid := '95100000-0000-0000-0000-000000000001';
  food constant uuid := '95200000-0000-0000-0000-000000000001';
  saving constant uuid := '95200000-0000-0000-0000-000000000002';
  actual public.category_month_targets%rowtype;
  bad_amount bigint;
  bad_month date;
  bad_category uuid;
begin
  -- Untouched global is an implicit state, not a copied snapshot.
  perform public.set_category_month_target(ledger, food, '2026-11-01', 'global');
  if exists (select 1 from public.category_month_targets where ledger_id = ledger) then
    raise exception 'global no-op created a row';
  end if;
  perform public.set_category_month_target(ledger, food, '2026-11-01', 'custom', 600000);
  perform public.set_category_month_target(ledger, food, '2026-11-01', 'custom', 600000);
  if (select count(*) from public.category_month_targets where ledger_id = ledger) <> 1 then
    raise exception 'retry duplicated target';
  end if;
  perform public.set_category_month_target(ledger, food, '2026-11-01', 'global', 999);
  update public.categories set budget_amount = 550000 where id = food;
  select * into actual from public.category_month_targets where category_id = food and month = '2026-11-01';
  if actual.source <> 'global' or actual.custom_amount <> 600000 then
    raise exception 'global switch overwrote the saved custom value';
  end if;
  perform public.set_category_month_target(ledger, food, '2026-11-01', 'custom', actual.custom_amount);
  perform public.set_category_month_target(ledger, food, '2026-12-01', 'custom', 700000);
  perform public.set_category_month_target(ledger, saving, '2026-11-01', 'custom', 0);
  if (select custom_amount from public.category_month_targets where category_id = food and month = '2026-11-01') <> 600000
    or (select custom_amount from public.category_month_targets where category_id = food and month = '2026-12-01') <> 700000
    or (select custom_amount from public.category_month_targets where category_id = saving and month = '2026-11-01') <> 0
    or (select budget_amount from public.categories where id = food) <> 550000 then
    raise exception 'month/category isolation or global preservation failed';
  end if;

  foreach bad_amount in array array[-1::bigint, 9007199254740992::bigint, null::bigint] loop
    begin
      perform public.set_category_month_target(ledger, food, '2026-11-01', 'custom', bad_amount);
      raise exception 'invalid amount accepted';
    exception when check_violation or not_null_violation then null;
    end;
  end loop;
  foreach bad_month in array array['2026-11-02'::date, 'infinity'::date, null::date] loop
    begin
      perform public.set_category_month_target(ledger, food, bad_month, 'global');
      raise exception 'invalid month accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  foreach bad_category in array array[
    '95200000-0000-0000-0000-000000000003'::uuid,
    '95200000-0000-0000-0000-000000000004'::uuid
  ] loop
    begin
      perform public.set_category_month_target(ledger, bad_category, '2026-11-01', 'custom', 1);
      raise exception 'income or cross-ledger category accepted';
    exception when invalid_parameter_value then null;
    end;
  end loop;
  begin
    perform public.set_category_month_target(ledger, food, '2026-11-01', 'other', 1);
    raise exception 'invalid source accepted';
  exception when invalid_parameter_value then null;
  end;
  -- Direct writes cannot evade category type / ledger relationships.
  begin
    insert into public.category_month_targets values (ledger, food, 'saving', '2026-10-01', 'custom', 1, now());
    raise exception 'wrong type accepted';
  exception when foreign_key_violation then null;
  end;
  begin
    insert into public.category_month_targets values (ledger, '95200000-0000-0000-0000-000000000004', 'expense', '2026-10-01', 'custom', 1, now());
    raise exception 'cross-ledger direct write accepted';
  exception when foreign_key_violation then null;
  end;
end $$;

-- Editor/viewer may read, but cannot save even a no-row global switch.
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000002', true);
do $$ begin
  if (select count(*) from public.category_month_targets) <> 3 then raise exception 'editor read failed'; end if;
  begin
    perform public.set_category_month_target('95100000-0000-0000-0000-000000000001', '95200000-0000-0000-0000-000000000001', '2027-01-01', 'global');
    raise exception 'editor saved';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000003', true);
do $$ begin
  if (select count(*) from public.category_month_targets) <> 3 then raise exception 'viewer read failed'; end if;
  begin
    perform public.set_category_month_target('95100000-0000-0000-0000-000000000001', '95200000-0000-0000-0000-000000000001', '2026-11-01', 'custom', 1);
    raise exception 'viewer saved';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.category_month_targets values ('95100000-0000-0000-0000-000000000001', '95200000-0000-0000-0000-000000000001', 'expense', '2027-01-01', 'custom', 1, now());
    raise exception 'viewer bypassed RPC';
  exception when insufficient_privilege then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '95000000-0000-0000-0000-000000000004', true);
do $$ begin
  if exists (select 1 from public.category_month_targets) then raise exception 'nonmember read other ledger'; end if;
  begin
    perform public.set_category_month_target('95100000-0000-0000-0000-000000000001', '95200000-0000-0000-0000-000000000001', '2026-11-01', 'global');
    raise exception 'nonmember saved';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set local role anon;
do $$ begin
  perform public.set_category_month_target('95100000-0000-0000-0000-000000000001', '95200000-0000-0000-0000-000000000001', '2026-11-01', 'global');
  raise exception 'anonymous executed function';
exception when insufficient_privilege then null;
end $$;
reset role;
rollback;
