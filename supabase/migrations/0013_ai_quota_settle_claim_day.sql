-- 0013_ai_quota_settle_claim_day.sql
-- P2: Settle/refund on the KST day that claim_ai_quota reserved, not "now".
--
-- claim_ai_quota already pins usage to ai_quota_kst_today() at claim time and
-- returns that day. settle_ai_quota / refund_ai_quota_request used to recompute
-- kst_today() at completion. A provider call that crosses KST midnight then:
--   - never released tokens_reserved on the claim day (stale reserve → monthly cap)
--   - recorded actual tokens on the next day (wrong day; cross-month misattributes)
--
-- Fix: accept optional p_day from the gateway (the claim response's day). When
-- null, fall back to kst_today() for ops/scripts. DROP+CREATE because Postgres
-- function identity includes argument types (new trailing p_day).

-- ── settle_ai_quota (add p_day) ──────────────────────────────────────────────
drop function if exists settle_ai_quota(text, bigint, bigint, bigint, uuid);

create or replace function settle_ai_quota(
  p_feature text,
  p_prompt bigint,
  p_completion bigint,
  p_token_estimate bigint default 0,
  p_user_id uuid default null,
  p_day date default null
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
  -- Prefer the day returned by claim_ai_quota so settle matches the reservation.
  v_day := coalesce(p_day, ai_quota_kst_today());
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

  -- _total: release reservation, add actual tokens (same day as claim)
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

revoke all on function settle_ai_quota(text, bigint, bigint, bigint, uuid, date) from public;
grant execute on function settle_ai_quota(text, bigint, bigint, bigint, uuid, date) to service_role;

-- ── refund_ai_quota_request (add p_day) ──────────────────────────────────────
drop function if exists refund_ai_quota_request(text, bigint, uuid);

create or replace function refund_ai_quota_request(
  p_feature text,
  p_token_estimate bigint default 0,
  p_user_id uuid default null,
  p_day date default null
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
  -- Same day as claim so request_count and tokens_reserved are released there.
  v_day := coalesce(p_day, ai_quota_kst_today());
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

revoke all on function refund_ai_quota_request(text, bigint, uuid, date) from public;
grant execute on function refund_ai_quota_request(text, bigint, uuid, date) to service_role;
