# `ai-gateway`

Provider-paid in-app AI entrypoint. Spec: `docs/4` §4.6.1 / §7.1, tracker S02.

## Control flow

```text
parse body (≤32 KiB) → getUser → AI_FEATURES_ENABLED → in_app_ai_enabled
  → is_ledger_member(minRole) → feature input limits
  → cache hit? (same model + schema-valid; no quota) → claim_ai_quota
  → OpenAI Responses API (20s, strict JSON Schema + domain validate)
  → settle | refund
  (settle/refund use claim's KST `day` so midnight-crossing calls release the same reservation)
  → optional cache upsert → audit log
```

## Secrets

| Name                        | Required | Notes                                                         |
| --------------------------- | -------- | ------------------------------------------------------------- |
| `OPENAI_API_KEY`            | yes      | OpenAI server-side API key                                    |
| `OPENAI_MODEL`              | yes      | `gpt-5.6`, `gpt-5.6-sol`, `gpt-5.6-terra`, or `gpt-5.6-luna`  |
| `OPENAI_REASONING_EFFORT`   | yes      | `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |
| `AI_FEATURES_ENABLED`       | yes\*    | only `true` enables paid calls                                |
| `SUPABASE_URL`              | auto     | platform                                                      |
| `SUPABASE_ANON_KEY`         | auto     | user JWT / getUser                                            |
| `SUPABASE_SERVICE_ROLE_KEY` | auto     | quota + cache writes                                          |

\*Dark launch: keep `false` until privacy gate (S04) + allowlist.

`OPENAI_MODEL` and `OPENAI_REASONING_EFFORT` are parsed at startup and have **no
fallback** — an invalid value fails every request with `upstream` (502) and an
`ai_gateway_config_error` log line. This check runs _before_ `AI_FEATURES_ENABLED`,
so the kill switch cannot mask a bad model id. Set all secrets before first deploy.

Not every reasoning model supports every effort value; a rejected value comes back
as `upstream` + HTTP 400 from the provider, not as a config error.

### Reasoning effort drives the token budget

`max_output_tokens` on the Responses API covers **reasoning + visible output**.
Raising the effort therefore raises what a request may generate, and the gateway
sizes both knobs together in `config.ts`:

- `VISIBLE_OUTPUT_TOKENS[feature]` — what the JSON result itself needs
- `REASONING_HEADROOM_TOKENS[effort]` — ceiling added on top (`none` → 0, `xhigh` → 25k)
- `maxOutputTokensFor(feature, effort)` — the only supported way to build the wire value
- `tokenEstimateFor(feature, effort)` — the quota reservation, since reasoning tokens are billed as output

Headroom is a ceiling, not an allocation: unused tokens are never generated or
billed. Never send `VISIBLE_OUTPUT_TOKENS` directly — the budget runs out during
reasoning and the response comes back `incomplete` with nothing usable, after the
provider has already billed input + reasoning.

## Deploy (not Amplify)

```bash
supabase secrets set OPENAI_API_KEY=... AI_FEATURES_ENABLED=false
supabase secrets set OPENAI_MODEL=gpt-5.6-luna
supabase secrets set OPENAI_REASONING_EFFORT=<none|minimal|low|medium|high|xhigh|max>
supabase functions deploy ai-gateway
```

List models the configured key can access:

```bash
curl -sS https://api.openai.com/v1/models -H "Authorization: Bearer $OPENAI_API_KEY"
```

## Debugging `code: "upstream"` (HTTP 502)

Boot success + audit `ok:false, code:"upstream"` means the handler reached OpenAI (or failed before the call with a missing key) and mapped the failure to 502. The **client** always gets the generic Korean message; the **audit log** carries the real cause:

| Audit field       | Meaning                                                                                       |
| ----------------- | --------------------------------------------------------------------------------------------- |
| `upstream_reason` | `http` / `timeout` / `missing_key` / `network` / `parse` / `empty` / `incomplete` / `refusal` |
| `upstream_status` | Provider HTTP status (when `reason=http`)                                                     |
| `error_detail`    | Short redacted message (e.g. `OpenAI HTTP 401: …`)                                            |

Common mappings:

- `missing_key` → set secret: `supabase secrets set OPENAI_API_KEY=...`
- `http` + 401/403 → invalid/rotated key
- `http` + 404 → configured model id is unavailable for the OpenAI project
- `http` + 400 → the configured effort is not supported by the configured model
- `http` + 429 → OpenAI quota/rate limit
- `timeout` → provider slow or egress blocked (timeout is 20s)
- `incomplete` + `max_output_tokens` → budget consumed before a usable result. `error_detail`
  carries both knobs (`max_output_tokens=… , effort=…`); raise `REASONING_HEADROOM_TOKENS`
  for that effort or lower `OPENAI_REASONING_EFFORT`. **This failure is billed** — the
  provider charged input + reasoning — so it is refunded to the user's quota but not to us.
- `refusal` → model declined; the request is not retried
- `parse` → two attempts both returned JSON that failed the feature schema

A config-time failure (bad `OPENAI_MODEL` / `OPENAI_REASONING_EFFORT` / missing Supabase env)
logs `audit: "ai_gateway_config_error"` instead and never reaches the audit line above.

Redeploy after this logging lands, reproduce one request, then read Edge Functions → ai-gateway → Logs for the audit line.

## Tests

Mock-deps acceptance (no Docker, no Deno):

```bash
pnpm exec vp test run supabase/functions/ai-gateway/
```

`gateway.test.ts` covers control flow via injected `GatewayDeps`; `config.test.ts`
covers env parsing and the token-budget arithmetic; `openai.test.ts` covers the
Responses API wire shape with a stubbed `fetch`.
