# `ai-gateway`

Provider-paid in-app AI entrypoint. Spec: `docs/4` §4.6.1 / §7.1, tracker S02.

## Control flow

```text
parse body (≤32 KiB) → getUser → AI_FEATURES_ENABLED → in_app_ai_enabled
  → is_ledger_member(minRole) → feature input limits
  → cache hit? (no quota) → claim_ai_quota → xAI (20s) → settle | refund
  (settle/refund use claim's KST `day` so midnight-crossing calls release the same reservation)
  → optional cache upsert → audit log
```

## Secrets

| Name                        | Required | Notes                          |
| --------------------------- | -------- | ------------------------------ |
| `XAI_API_KEY`               | yes      | xAI Bearer                     |
| `AI_FEATURES_ENABLED`       | yes\*    | only `true` enables paid calls |
| `SUPABASE_URL`              | auto     | platform                       |
| `SUPABASE_ANON_KEY`         | auto     | user JWT / getUser             |
| `SUPABASE_SERVICE_ROLE_KEY` | auto     | quota + cache writes           |

\*Dark launch: keep `false` until privacy gate (S04) + allowlist.

## Deploy (not Amplify)

```bash
supabase secrets set XAI_API_KEY=... AI_FEATURES_ENABLED=false
supabase functions deploy ai-gateway
```

## Tests

Mock-deps acceptance (no Docker):

```bash
pnpm exec vp test run supabase/functions/ai-gateway/gateway.test.ts
```
