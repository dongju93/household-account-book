-- 0011_ai_platform.sql
-- Provider-paid in-app AI platform tables + atomic quota RPCs (docs/4 §4.8, §8, PR-1).
--
-- - Day / month boundaries: Asia/Seoul (not UTC midnight).
-- - Quota writes only via SECURITY DEFINER RPCs with EXECUTE granted to service_role
--   only (ai-gateway). Never grant claim/settle/refund to authenticated.
-- - ai_user_settings.in_app_ai_enabled default false (dark launch; public ON is a follow-up).
-- - Limits: §4.8.1 ($50/mo band). Global token cap feature = '_total' → 200_000 / KST month.

-- ── 1. ai_usage_daily ────────────────────────────────────────────────────────
create table ai_usage_daily (
  user_id           uuid not null references auth.users (id) on delete cascade,
  -- Calendar day in Asia/Seoul (set by claim RPC)
  day               date not null,
  -- Feature id, or '_total' for global token accounting
  feature           text not null,
  request_count     int  not null default 0 check (request_count >= 0),
  prompt_tokens     bigint not null default 0 check (prompt_tokens >= 0),
  completion_tokens bigint not null default 0 check (completion_tokens >= 0),
  -- Claim-time reservation; settle converts to actual tokens, refund releases
  tokens_reserved   bigint not null default 0 check (tokens_reserved >= 0),
  primary key (user_id, day, feature)
);

create index ai_usage_daily_user_day_idx on ai_usage_daily (user_id, day);

alter table ai_usage_daily enable row level security;

-- Own rows readable (settings residual-quota UI later). No authenticated writes.
create policy ai_usage_daily_select_own on ai_usage_daily
  for select to authenticated
  using (user_id = auth.uid());
-- intentional: no INSERT/UPDATE/DELETE policies for authenticated → deny

-- ── 2. ai_insight_cache ──────────────────────────────────────────────────────
create table ai_insight_cache (
  ledger_id         uuid not null references ledgers (id) on delete cascade,
  feature           text not null,
  period_key        text not null,
  data_version_hash text not null,
  result_json       jsonb not null,
  model             text not null,
  created_at        timestamptz not null default now(),
  expires_at        timestamptz not null,
  primary key (ledger_id, feature, period_key, data_version_hash)
);

create index ai_insight_cache_expires_idx on ai_insight_cache (expires_at);
create index ai_insight_cache_ledger_feature_period_idx
  on ai_insight_cache (ledger_id, feature, period_key, created_at desc);

alter table ai_insight_cache enable row level security;

-- Ledger members can read cached narratives. Writes: service_role / Edge only.
create policy ai_insight_cache_select_member on ai_insight_cache
  for select to authenticated
  using (is_ledger_member(ledger_id, 'viewer'));
-- intentional: no INSERT/UPDATE/DELETE for authenticated → deny

-- ── 3. ai_user_settings ──────────────────────────────────────────────────────
create table ai_user_settings (
  user_id            uuid primary key references auth.users (id) on delete cascade,
  -- Dark launch: default false. Public ON (Q2) flips default / missing-row later.
  in_app_ai_enabled  boolean not null default false,
  share_memo_with_ai boolean not null default true,
  updated_at         timestamptz not null default now()
);

create trigger trg_ai_user_settings_updated
  before update on ai_user_settings
  for each row execute function set_updated_at();

alter table ai_user_settings enable row level security;

create policy ai_user_settings_select_own on ai_user_settings
  for select to authenticated
  using (user_id = auth.uid());
create policy ai_user_settings_insert_own on ai_user_settings
  for insert to authenticated
  with check (user_id = auth.uid());
create policy ai_user_settings_update_own on ai_user_settings
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
-- no DELETE for authenticated (row may be upserted; soft opt-out via flag)

-- ── 4. Quota limit helpers ───────────────────────────────────────────────────
-- Daily request limits per feature (§4.8.1). Unknown feature → 0 (reject).
create or replace function ai_quota_daily_limit(p_feature text)
returns int
language sql
immutable
as $$
  select case p_feature
    when 'nl_txn_parse'          then 40
    when 'category_suggest'      then 60
    when 'month_insight'         then 10
    when 'period_explain'        then 10
    when 'month_close_narrative' then 5
    when 'budget_recommend'      then 3
    when 'chat_turn'             then 10
    else 0
  end;
$$;

-- Monthly request limits per feature (§4.8.1).
create or replace function ai_quota_monthly_limit(p_feature text)
returns int
language sql
immutable
as $$
  select case p_feature
    when 'nl_txn_parse'          then 400
    when 'category_suggest'      then 600
    when 'month_insight'         then 40
    when 'period_explain'        then 40
    when 'month_close_narrative' then 20
    when 'budget_recommend'      then 10
    when 'chat_turn'             then 60
    else 0
  end;
$$;

-- Global monthly token cap across all features (§4.8.1).
create or replace function ai_quota_monthly_token_cap()
returns bigint
language sql
immutable
as $$
  select 200000::bigint;
$$;

revoke all on function ai_quota_daily_limit(text) from public;
revoke all on function ai_quota_monthly_limit(text) from public;
revoke all on function ai_quota_monthly_token_cap() from public;
-- helpers used only inside DEFINER RPCs; no client grant needed

-- KST calendar day and month-start for "today" / monthly windows.
create or replace function ai_quota_kst_today()
returns date
language sql
stable
as $$
  select (timezone('Asia/Seoul', now()))::date;
$$;

create or replace function ai_quota_kst_month_start(p_day date default null)
returns date
language sql
stable
as $$
  select date_trunc(
    'month',
    coalesce(p_day, (timezone('Asia/Seoul', now()))::date)
  )::date;
$$;

revoke all on function ai_quota_kst_today() from public;
revoke all on function ai_quota_kst_month_start(date) from public;

-- Resolve caller identity for quota RPCs.
-- Edge: service_role JWT + explicit p_user_id.
-- Client JWT: p_user_id null → auth.uid() (self only).
-- Ops/tests: session_user postgres (Supabase local postgres is NOT rolsuper).
create or replace function ai_quota_resolve_user(p_user_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public, auth
as $$
declare
  v_uid uuid;
  v_jwt_role text;
  v_set_role text;
  v_is_super boolean;
  v_allowed boolean := false;
begin
  v_uid := coalesce(p_user_id, auth.uid());
  if v_uid is null then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  -- authenticated callers may only act as themselves
  if auth.uid() is not null and auth.uid() is distinct from v_uid then
    raise exception 'forbidden' using errcode = '42501';
  end if;

  -- JWT present and matches: ok (self-claim path)
  if auth.uid() is not null then
    return v_uid;
  end if;

  -- No JWT: Edge service_role, postgres ops, or true superuser
  v_jwt_role := coalesce(
    nullif(auth.role(), ''),
    nullif(current_setting('request.jwt.claim.role', true), '')
  );
  v_set_role := nullif(current_setting('role', true), '');
  if v_set_role = 'none' then
    v_set_role := null;
  end if;

  select r.rolsuper into v_is_super
  from pg_roles r
  where r.rolname = session_user;

  v_allowed :=
    coalesce(v_jwt_role, '') = 'service_role'
    or coalesce(v_set_role, '') = 'service_role'
    or session_user = 'postgres'
    or session_user = 'supabase_admin'
    or coalesce(v_is_super, false);

  if not v_allowed then
    raise exception 'unauthorized' using errcode = '28000';
  end if;

  return v_uid;
end;
$$;

revoke all on function ai_quota_resolve_user(uuid) from public;

-- ── 5. claim_ai_quota ────────────────────────────────────────────────────────
-- Atomic pre-xAI claim: +1 request (feature day), reserve tokens on '_total'.
-- Double-spend safe via single transaction + ON CONFLICT … WHERE … RETURNING.
--
-- Returns jsonb:
--   ok=true  → remaining_daily, remaining_monthly, remaining_tokens_month
--   ok=false → reason: 'daily' | 'monthly' | 'tokens' | 'unknown_feature'
--
-- p_user_id: required (Edge service_role + explicit user id). EXECUTE is service_role only.
create or replace function claim_ai_quota(
  p_feature text,
  p_token_estimate bigint,
  p_user_id uuid default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid           uuid;
  v_day           date;
  v_month_start   date;
  v_daily_limit   int;
  v_monthly_limit int;
  v_token_cap     bigint;
  v_estimate      bigint;
  v_claimed       ai_usage_daily%rowtype;
  v_monthly_req   bigint;
  v_monthly_tok   bigint;
  v_remaining_d   int;
  v_remaining_m   int;
  v_remaining_t   bigint;
begin
  v_uid := ai_quota_resolve_user(p_user_id);
  v_day := ai_quota_kst_today();
  v_month_start := ai_quota_kst_month_start(v_day);
  v_estimate := greatest(coalesce(p_token_estimate, 0), 0);
  v_token_cap := ai_quota_monthly_token_cap();

  if p_feature is null or p_feature = '' or p_feature = '_total' then
    return jsonb_build_object('ok', false, 'reason', 'unknown_feature');
  end if;

  v_daily_limit := ai_quota_daily_limit(p_feature);
  v_monthly_limit := ai_quota_monthly_limit(p_feature);
  if v_daily_limit <= 0 or v_monthly_limit <= 0 then
    return jsonb_build_object('ok', false, 'reason', 'unknown_feature');
  end if;

  -- Serialize all claims for this user so monthly request + token checks cannot race.
  perform pg_advisory_xact_lock(hashtextextended('ai_quota:' || v_uid::text, 0));

  -- 1) Atomic daily request claim for feature
  insert into ai_usage_daily as u (user_id, day, feature, request_count)
  values (v_uid, v_day, p_feature, 1)
  on conflict (user_id, day, feature) do update
    set request_count = u.request_count + 1
    where u.request_count < v_daily_limit
  returning * into v_claimed;

  if not found then
    return jsonb_build_object(
      'ok', false,
      'reason', 'daily',
      'remaining_daily', 0,
      'remaining_monthly', 0,
      'remaining_tokens_month', 0
    );
  end if;

  -- 2) Monthly request sum (includes the just-claimed day)
  select coalesce(sum(request_count), 0)
    into v_monthly_req
  from ai_usage_daily
  where user_id = v_uid
    and feature = p_feature
    and day >= v_month_start
    and day <= v_day;

  if v_monthly_req > v_monthly_limit then
    -- roll back the daily claim
    update ai_usage_daily
      set request_count = request_count - 1
    where user_id = v_uid and day = v_day and feature = p_feature
      and request_count > 0;
    return jsonb_build_object(
      'ok', false,
      'reason', 'monthly',
      'remaining_daily', greatest(v_daily_limit - (v_claimed.request_count - 1), 0),
      'remaining_monthly', 0,
      'remaining_tokens_month', 0
    );
  end if;

  -- 3) Reserve tokens on '_total' for this KST day
  insert into ai_usage_daily as t (user_id, day, feature, tokens_reserved)
  values (v_uid, v_day, '_total', v_estimate)
  on conflict (user_id, day, feature) do update
    set tokens_reserved = t.tokens_reserved + v_estimate;

  -- 4) Monthly token usage = settled + still-reserved across the KST month
  select coalesce(sum(prompt_tokens + completion_tokens + tokens_reserved), 0)
    into v_monthly_tok
  from ai_usage_daily
  where user_id = v_uid
    and feature = '_total'
    and day >= v_month_start
    and day <= v_day;

  if v_monthly_tok > v_token_cap then
    -- roll back token reserve and daily claim
    update ai_usage_daily
      set tokens_reserved = greatest(tokens_reserved - v_estimate, 0)
    where user_id = v_uid and day = v_day and feature = '_total';
    update ai_usage_daily
      set request_count = request_count - 1
    where user_id = v_uid and day = v_day and feature = p_feature
      and request_count > 0;
    return jsonb_build_object(
      'ok', false,
      'reason', 'tokens',
      'remaining_daily', greatest(v_daily_limit - (v_claimed.request_count - 1), 0),
      'remaining_monthly', greatest(v_monthly_limit - (v_monthly_req - 1), 0),
      'remaining_tokens_month', 0
    );
  end if;

  v_remaining_d := greatest(v_daily_limit - v_claimed.request_count, 0);
  v_remaining_m := greatest(v_monthly_limit - v_monthly_req, 0);
  v_remaining_t := greatest(v_token_cap - v_monthly_tok, 0);

  return jsonb_build_object(
    'ok', true,
    'remaining_daily', v_remaining_d,
    'remaining_monthly', v_remaining_m,
    'remaining_tokens_month', v_remaining_t,
    'day', v_day,
    'feature', p_feature
  );
end;
$$;

revoke all on function claim_ai_quota(text, bigint, uuid) from public;
-- Gateway-only: authenticated clients must not claim/settle/refund (quota bypass).
grant execute on function claim_ai_quota(text, bigint, uuid) to service_role;

-- ── 6. settle_ai_quota ───────────────────────────────────────────────────────
-- After successful xAI: convert reserved estimate → actual prompt/completion tokens.
-- p_token_estimate must match the estimate used at claim (Edge holds it).
-- If actual > estimate, usage may exceed cap for this settle; next claim still blocked.
create or replace function settle_ai_quota(
  p_feature text,
  p_prompt bigint,
  p_completion bigint,
  p_token_estimate bigint default 0,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid      uuid;
  v_day      date;
  v_estimate bigint;
  v_prompt   bigint;
  v_comp     bigint;
begin
  v_uid := ai_quota_resolve_user(p_user_id);
  v_day := ai_quota_kst_today();
  v_estimate := greatest(coalesce(p_token_estimate, 0), 0);
  v_prompt := greatest(coalesce(p_prompt, 0), 0);
  v_comp := greatest(coalesce(p_completion, 0), 0);

  if p_feature is null or p_feature = '' or p_feature = '_total' then
    raise exception 'unknown_feature' using errcode = '22023';
  end if;

  -- Feature day: record actual tokens (optional observability per feature)
  insert into ai_usage_daily as u (
    user_id, day, feature, prompt_tokens, completion_tokens
  )
  values (v_uid, v_day, p_feature, v_prompt, v_comp)
  on conflict (user_id, day, feature) do update
    set prompt_tokens     = u.prompt_tokens + v_prompt,
        completion_tokens = u.completion_tokens + v_comp;

  -- _total: release reservation, add actual tokens
  insert into ai_usage_daily as t (
    user_id, day, feature, prompt_tokens, completion_tokens, tokens_reserved
  )
  values (v_uid, v_day, '_total', v_prompt, v_comp, 0)
  on conflict (user_id, day, feature) do update
    set prompt_tokens     = t.prompt_tokens + v_prompt,
        completion_tokens = t.completion_tokens + v_comp,
        tokens_reserved   = greatest(t.tokens_reserved - v_estimate, 0);
end;
$$;

revoke all on function settle_ai_quota(text, bigint, bigint, bigint, uuid) from public;
grant execute on function settle_ai_quota(text, bigint, bigint, bigint, uuid) to service_role;

-- ── 7. refund_ai_quota_request ───────────────────────────────────────────────
-- Upstream/parse failure before a successful settle: undo request + release reserve.
-- p_token_estimate must match the claim estimate.
-- EXECUTE is service_role only — client-callable refund races erase in-flight claims.
create or replace function refund_ai_quota_request(
  p_feature text,
  p_token_estimate bigint default 0,
  p_user_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_uid      uuid;
  v_day      date;
  v_estimate bigint;
begin
  v_uid := ai_quota_resolve_user(p_user_id);
  v_day := ai_quota_kst_today();
  v_estimate := greatest(coalesce(p_token_estimate, 0), 0);

  if p_feature is null or p_feature = '' or p_feature = '_total' then
    raise exception 'unknown_feature' using errcode = '22023';
  end if;

  update ai_usage_daily
    set request_count = greatest(request_count - 1, 0)
  where user_id = v_uid
    and day = v_day
    and feature = p_feature;

  update ai_usage_daily
    set tokens_reserved = greatest(tokens_reserved - v_estimate, 0)
  where user_id = v_uid
    and day = v_day
    and feature = '_total';
end;
$$;

revoke all on function refund_ai_quota_request(text, bigint, uuid) from public;
grant execute on function refund_ai_quota_request(text, bigint, uuid) to service_role;

-- ── 8. Grants for tables (PostgREST) ─────────────────────────────────────────
grant select on ai_usage_daily to authenticated;
grant select on ai_insight_cache to authenticated;
grant select, insert, update on ai_user_settings to authenticated;

-- service_role bypasses RLS; explicit grants for clarity when used via SQL
grant all on ai_usage_daily to service_role;
grant all on ai_insight_cache to service_role;
grant all on ai_user_settings to service_role;
