-- Provider consent version for in-app AI (xAI → OpenAI migration).
--
-- `in_app_ai_enabled` alone is unversioned: a user who opted in under a prior
-- foreign processor would keep transmitting after the disclosure named a new
-- one. We:
--   1. Store which disclosure/provider revision the user last accepted.
--   2. Force-disable existing opt-ins so the live gateway (still boolean-only
--      until the next function deploy) stops sending data under stale consent.
--
-- Effective opt-in = in_app_ai_enabled AND disclosure_version = current
-- (see src/data/aiSettings.ts and ai-gateway isInAppAiEnabled). Bump the
-- app/edge constant and re-prompt on the next provider or disclosure change.
alter table ai_user_settings
add column disclosure_version text;

-- One-shot: prior true flags named xAI in the disclosure, not OpenAI.
update ai_user_settings
set
  in_app_ai_enabled = false
where
  in_app_ai_enabled = true;