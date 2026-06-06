-- 0001_core_schema.sql
-- Core tables for the 가계부 app. Money is BIGINT integer KRW (no minor unit,
-- amounts are positive integers per spec §2.5). All ids are UUID for symmetry
-- with auth.users. Every foreign key is explicitly indexed (Postgres does not
-- auto-index FKs).

-- ── Enumerations ─────────────────────────────────────────────────────────────
create type fund_type as enum ('income', 'expense', 'saving', 'investment');
create type member_role as enum ('owner', 'editor', 'viewer');
create type txn_source as enum ('manual', 'recurring');

-- ── Shared updated_at trigger ────────────────────────────────────────────────
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- ── 1. ledgers ───────────────────────────────────────────────────────────────
create table ledgers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '내 가계부' check (length(name) between 1 and 60),
  owner_id   uuid not null references auth.users (id) on delete cascade,
  currency   text not null default 'KRW' check (currency in ('KRW')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index ledgers_owner_idx on ledgers (owner_id);
create trigger trg_ledgers_updated before update on ledgers
  for each row execute function set_updated_at();

-- ── 2. ledger_members (membership + role) ────────────────────────────────────
create table ledger_members (
  ledger_id  uuid not null references ledgers (id) on delete cascade,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       member_role not null default 'viewer',
  created_at timestamptz not null default now(),
  primary key (ledger_id, user_id)
);
create index ledger_members_user_idx on ledger_members (user_id);

-- ── 3. categories ────────────────────────────────────────────────────────────
create table categories (
  id            uuid primary key default gen_random_uuid(),
  ledger_id     uuid not null references ledgers (id) on delete cascade,
  name          text not null check (length(name) between 1 and 40),
  type          fund_type not null,
  budget_amount bigint check (budget_amount is null or budget_amount >= 0),
  goal_amount   bigint check (goal_amount is null or goal_amount >= 0),
  sort_order    integer not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  -- only 지출 may set a budget; only 저축 may set a goal; 수입/투자 set neither
  constraint budget_only_expense check (budget_amount is null or type = 'expense'),
  constraint goal_only_saving    check (goal_amount   is null or type = 'saving')
);
create index categories_ledger_idx on categories (ledger_id);
create index categories_ledger_type_active_idx on categories (ledger_id, type) where is_active;
-- unique ACTIVE name per ledger (inactive duplicates allowed after rename/deactivate)
create unique index categories_unique_active_name
  on categories (ledger_id, name) where is_active;
create trigger trg_categories_updated before update on categories
  for each row execute function set_updated_at();

-- ── 4. recurring_items (고정 항목) ────────────────────────────────────────────
create table recurring_items (
  id           uuid primary key default gen_random_uuid(),
  ledger_id    uuid not null references ledgers (id) on delete cascade,
  category_id  uuid not null references categories (id) on delete restrict,
  name         text not null check (length(name) between 1 and 60),
  type         fund_type not null,
  amount       bigint not null check (amount > 0),
  start_month  date not null,        -- always first-of-month
  end_month    date,                 -- null = forever
  day_of_month smallint not null default 1 check (day_of_month between 1 and 31),
  is_active    boolean not null default true,
  memo         text check (memo is null or length(memo) <= 200),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint end_after_start    check (end_month is null or end_month >= start_month),
  constraint start_is_month_first check (date_trunc('month', start_month) = start_month),
  constraint end_is_month_first   check (end_month is null or date_trunc('month', end_month) = end_month)
);
create index recurring_ledger_idx on recurring_items (ledger_id);
create index recurring_category_idx on recurring_items (category_id);
create index recurring_active_idx on recurring_items (ledger_id) where is_active;
create trigger trg_recurring_updated before update on recurring_items
  for each row execute function set_updated_at();

-- ── 5. transactions ──────────────────────────────────────────────────────────
create table transactions (
  id               uuid primary key default gen_random_uuid(),
  ledger_id        uuid not null references ledgers (id) on delete cascade,
  category_id      uuid not null references categories (id) on delete restrict,
  txn_date         date not null,
  type             fund_type not null,
  amount           bigint not null check (amount > 0),
  memo             text check (memo is null or length(memo) <= 200),
  source           txn_source not null default 'manual',
  recurring_id     uuid references recurring_items (id) on delete set null,
  occurrence_month date,  -- first-of-month; present only for recurring-sourced rows
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint source_fields_consistent check (
    (source = 'manual'    and recurring_id is null and occurrence_month is null) or
    (source = 'recurring' and recurring_id is not null and occurrence_month is not null)
  )
);
create index transactions_category_idx on transactions (category_id);
create index transactions_recurring_idx on transactions (recurring_id);
-- primary read path: a ledger's transactions, newest first (drives the list + month queries)
create index transactions_ledger_date_idx on transactions (ledger_id, txn_date desc, id desc);
-- idempotency: at most one materialized row per (recurring item, month)
create unique index transactions_recurring_occurrence
  on transactions (recurring_id, occurrence_month) where source = 'recurring';
create trigger trg_transactions_updated before update on transactions
  for each row execute function set_updated_at();

-- ── 6. recurring_skips ───────────────────────────────────────────────────────
-- Records a deleted recurring occurrence so re-opening the month does NOT
-- resurrect it during materialization (the documented single-occurrence delete
-- policy, spec §2.5 / §5.2).
create table recurring_skips (
  recurring_id     uuid not null references recurring_items (id) on delete cascade,
  occurrence_month date not null check (date_trunc('month', occurrence_month) = occurrence_month),
  ledger_id        uuid not null references ledgers (id) on delete cascade,
  created_at       timestamptz not null default now(),
  primary key (recurring_id, occurrence_month)
);
create index recurring_skips_ledger_idx on recurring_skips (ledger_id);
