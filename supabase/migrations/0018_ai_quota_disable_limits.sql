-- Disable AI quota enforcement.
--
-- The quota was built to divide a shared provider budget among many users
-- (docs/4 §4.8.1). This deployment has one user, who is also the account
-- holder paying OpenAI, so there is nothing to divide and the enforcement
-- point belongs at the provider's spend limit, not here — that ceiling holds
-- regardless of whether our token bookkeeping is correct.
--
-- Our bookkeeping is not correct: a `timeout` failure is billed by OpenAI but
-- recorded as zero tokens (no usage on an AbortError, so gateway.ts refunds
-- instead of settling). 0017 had made the token cap the only guard, which made
-- an undercounting guard the sole ceiling. Rather than fix accounting for a
-- limit nobody needs, the limit goes away.
--
-- Kept deliberately:
--   - `else 0`, because claim_ai_quota rejects an unrecognized feature name
--     only via a non-positive limit. Removing it would let an arbitrary string
--     through the gate.
--   - The claim/settle/refund call path in gateway.ts, untouched. ai_usage_daily
--     still records real usage per feature, so spend attribution survives; only
--     enforcement stops. Re-enabling is a one-migration change of these numbers.

create or replace function ai_quota_daily_limit(p_feature text)
returns int
language sql
immutable
as $$
  select case p_feature
    when 'nl_txn_parse'          then 1000000
    when 'category_suggest'      then 1000000
    when 'month_insight'         then 1000000
    when 'period_explain'        then 1000000
    when 'month_close_narrative' then 1000000
    when 'budget_recommend'      then 1000000
    when 'chat_turn'             then 1000000
    else 0
  end;
$$;

create or replace function ai_quota_monthly_limit(p_feature text)
returns int
language sql
immutable
as $$
  select case p_feature
    when 'nl_txn_parse'          then 1000000
    when 'category_suggest'      then 1000000
    when 'month_insight'         then 1000000
    when 'period_explain'        then 1000000
    when 'month_close_narrative' then 1000000
    when 'budget_recommend'      then 1000000
    when 'chat_turn'             then 1000000
    else 0
  end;
$$;

create or replace function ai_quota_monthly_token_cap()
returns bigint
language sql
immutable
as $$
  select 1000000000::bigint;
$$;

revoke all on function ai_quota_daily_limit(text) from public;
revoke all on function ai_quota_monthly_limit(text) from public;
revoke all on function ai_quota_monthly_token_cap() from public;
