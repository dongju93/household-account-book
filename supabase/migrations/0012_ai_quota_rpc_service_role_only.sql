-- 0012_ai_quota_rpc_service_role_only.sql
-- P1: Restrict claim/settle/refund quota RPCs to the Edge gateway (service_role).
--
-- 0011 briefly granted EXECUTE to authenticated. Refund is keyed only by
-- (user, feature, KST day), not a claim id — any user JWT could race
-- refund_ai_quota_request against each gateway request, erase the reservation
-- before settle, then open further calls and exceed daily/monthly/token caps.
--
-- Design (docs/4 §4.6.1): only the service-role client in ai-gateway mutates
-- quota. Revoke authenticated execute; keep service_role.
-- Idempotent for greenfield installs where 0011 already omits these grants.
revoke execute on function claim_ai_quota (text, bigint, uuid)
from
    authenticated;

revoke execute on function settle_ai_quota (text, bigint, bigint, bigint, uuid)
from
    authenticated;

revoke execute on function refund_ai_quota_request (text, bigint, uuid)
from
    authenticated;

-- Ensure service_role retains execute (explicit after revoke-all patterns elsewhere).
grant execute on function claim_ai_quota (text, bigint, uuid) to service_role;

grant execute on function settle_ai_quota (text, bigint, bigint, bigint, uuid) to service_role;

grant execute on function refund_ai_quota_request (text, bigint, uuid) to service_role;