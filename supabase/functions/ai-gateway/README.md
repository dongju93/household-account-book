# `ai-gateway`

Provider-paid in-app AI entrypoint. Spec: `docs/4` §4.6.1 / §7.1, tracker S02.

## Control flow

```text
parse body (≤32 KiB) → getUser → AI_FEATURES_ENABLED → in_app_ai_enabled
  → is_ledger_member(minRole) → feature input limits
  → cache hit? (schema-valid only; no quota) → claim_ai_quota → xAI (20s, JSON+schema validate)
  → settle | refund
  (settle/refund use claim's KST `day` so midnight-crossing calls release the same reservation)
  → optional cache upsert → audit log
```

## Secrets

| Name                        | Required | Notes                                                                  |
| --------------------------- | -------- | ---------------------------------------------------------------------- |
| `XAI_API_KEY`               | yes      | xAI Bearer                                                             |
| `AI_FEATURES_ENABLED`       | yes\*    | only `true` enables paid calls                                         |
| `XAI_DEFAULT_MODEL`         | no       | overrides `DEFAULT_MODEL` (`grok-4.5`); use a model your team can call |
| `SUPABASE_URL`              | auto     | platform                                                               |
| `SUPABASE_ANON_KEY`         | auto     | user JWT / getUser                                                     |
| `SUPABASE_SERVICE_ROLE_KEY` | auto     | quota + cache writes                                                   |

\*Dark launch: keep `false` until privacy gate (S04) + allowlist.

## Deploy (not Amplify)

```bash
supabase secrets set XAI_API_KEY=... AI_FEATURES_ENABLED=false
# optional — only if DEFAULT_MODEL is not enabled for your xAI team:
# supabase secrets set XAI_DEFAULT_MODEL=grok-4.5
supabase functions deploy ai-gateway
```

List models your key can actually call (team entitlements ≠ public docs list):

```bash
curl -sS https://api.x.ai/v1/models -H "Authorization: Bearer $XAI_API_KEY"
```

## Debugging `code: "upstream"` (HTTP 502)

Boot success + audit `ok:false, code:"upstream"` means the handler reached xAI (or failed before the call with a missing key) and mapped the failure to 502. The **client** always gets the generic Korean message; the **audit log** carries the real cause:

| Audit field       | Meaning                                                  |
| ----------------- | -------------------------------------------------------- |
| `upstream_reason` | `http` / `timeout` / `missing_key` / `network` / `parse` |
| `upstream_status` | Provider HTTP status (when `reason=http`)                |
| `error_detail`    | Short redacted message (e.g. `xAI HTTP 401: …`)          |

Common mappings:

- `missing_key` → set secret: `supabase secrets set XAI_API_KEY=xai-...`
- `http` + 401/403 → invalid/rotated key
- `http` + 404 → model id rejected for this team (set `XAI_DEFAULT_MODEL` to an id from `GET /v1/models`, or enable the model in the xAI console)
- `http` + 429 → quota/rate limit at xAI
- `timeout` → provider slow or egress blocked (timeout is 20s)

Redeploy after this logging lands, reproduce one request, then read Edge Functions → ai-gateway → Logs for the audit line.

## Tests

Mock-deps acceptance (no Docker):

```bash
pnpm exec vp test run supabase/functions/ai-gateway/gateway.test.ts
```
