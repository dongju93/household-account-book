-- Re-scale AI quota limits for a single-owner deployment.
--
-- The 0011 numbers came from docs/4 §4.8.1, which sized them so a ~$50/month
-- provider LLM budget could be shared across ~100–700 MAU. The per-user
-- `_total` cap of 200,000 tokens/month is therefore *one user's slice of 700*.
-- This deployment has one user, who is also the one paying the provider bill,
-- so that slice is off by roughly three orders of magnitude: routine use hit
-- the per-feature daily request cap (`month_insight` 10/day) in normal work.
--
-- Two additional pressures made the old numbers bind sooner than §4.8.1
-- predicted:
--   1. Reasoning tokens are billed as output and reserved at claim time
--      (REASONING_ESTIMATE_TOKENS in config.ts), which the §10 cost sketch
--      predates — it assumed ~150 output tokens for month_insight.
--   2. A provider call that fails *after* being billed settles rather than
--      refunds (gateway.ts safeSettle), and settle_ai_quota deliberately does
--      not decrement request_count. So upstream/timeout failures consume the
--      daily allowance permanently — correct behavior (money left), but it
--      means debugging sessions burn a 10/day budget fast.
--
-- What this migration keeps: the shape, not the calibration. Per-feature
-- request counts move to levels normal single-user work will not reach, and
-- the global monthly token cap stays the one real cost guard — a retry loop or
-- a runaway client still gets stopped before it can drain the provider account.
-- `else 0` is preserved in both limit functions: claim_ai_quota relies on a
-- non-positive limit to reject an unrecognized feature name.
--
-- To re-tighten (e.g. if this ever gains other users), replace these three
-- functions again with the §4.8.1 values.

-- ── Daily request limits ─────────────────────────────────────────────────────
create or replace function ai_quota_daily_limit(p_feature text)
returns int
language sql
immutable
as $$
  select case p_feature
    when 'nl_txn_parse'          then 500
    when 'category_suggest'      then 500
    when 'month_insight'         then 200
    when 'period_explain'        then 200
    when 'month_close_narrative' then 200
    when 'budget_recommend'      then 200
    when 'chat_turn'             then 500
    else 0
  end;
$$;

-- ── Monthly request limits ───────────────────────────────────────────────────
create or replace function ai_quota_monthly_limit(p_feature text)
returns int
language sql
immutable
as $$
  select case p_feature
    when 'nl_txn_parse'          then 5000
    when 'category_suggest'      then 5000
    when 'month_insight'         then 2000
    when 'period_explain'        then 2000
    when 'month_close_narrative' then 2000
    when 'budget_recommend'      then 2000
    when 'chat_turn'             then 5000
    else 0
  end;
$$;

-- ── Global monthly token cap ─────────────────────────────────────────────────
-- The binding guard now. Sized so ordinary use never reaches it while a bug
-- that loops requests still terminates well short of a meaningful provider
-- bill. Lower this first if provider spend ever needs throttling — it is one
-- number and it covers every feature at once.
create or replace function ai_quota_monthly_token_cap()
returns bigint
language sql
immutable
as $$
  select 5000000::bigint;
$$;

-- Grants are unchanged (0011 revoked these from public; they are called only
-- from inside the SECURITY DEFINER quota RPCs), but re-assert them so a
-- replace can never widen access by inheriting a default.
revoke all on function ai_quota_daily_limit(text) from public;
revoke all on function ai_quota_monthly_limit(text) from public;
revoke all on function ai_quota_monthly_token_cap() from public;
