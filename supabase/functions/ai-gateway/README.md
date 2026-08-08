# `ai-gateway`

Provider-paid in-app AI entrypoint. Spec: `docs/4` §4.6.1 / §7.1, tracker S02.

## Control flow

```text
parse body (≤32 KiB) → getUser → AI_FEATURES_ENABLED
  → in_app_ai_enabled + disclosure_version == AI_DISCLOSURE_VERSION
  → is_ledger_member(minRole) → feature input limits
  → cache hit? (same model + reasoning effort + schema-valid; no quota) → claim_ai_quota
  → OpenAI Responses API (effort-derived deadline, strict JSON Schema + domain validate)
  → settle | refund
  (settle/refund use claim's KST `day` so midnight-crossing calls release the same reservation)
  → optional cache upsert → audit log
```

Effective opt-in requires both the boolean and `disclosure_version` matching
`AI_DISCLOSURE_VERSION` in `config.ts` (mirrored in `src/ai/types.ts`). Bump the
constant when the named foreign processor or disclosure changes; users must
re-enable under the new copy before data is sent.

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

### Reasoning effort drives the token budget _and the deadline_

`max_output_tokens` on the Responses API covers **reasoning + visible output**.
Raising the effort therefore raises what a request may generate, and the gateway
sizes all three knobs together in `config.ts`:

- `VISIBLE_OUTPUT_TOKENS[feature]` — what the JSON result itself needs
- `REASONING_HEADROOM_TOKENS[effort]` — ceiling added on top (`none` → 0, `xhigh` → 25k)
- `maxOutputTokensFor(feature, effort)` — the only supported way to build the wire value
- `tokenEstimateFor(feature, effort)` — the quota reservation, since reasoning tokens are billed as output
- `requestDeadlineMsFor(effort)` — the wall-clock budget, which has to scale with them

Headroom is a ceiling, not an allocation: unused tokens are never generated or
billed. Never send `VISIBLE_OUTPUT_TOKENS` directly — the budget runs out during
reasoning and the response comes back `incomplete` with nothing usable, after the
provider has already billed input + reasoning.

A **flat** deadline is the same class of bug in the other direction: at `high`
the wire budget is ~16.5k tokens, which no model emits inside 20s, so any request
that actually used its reasoning allowance aborted as `upstream`/`timeout` after
the provider had begun billing. `REQUEST_DEADLINE_MS` scales with effort for that
reason, and `config.test.ts` fails if headroom is raised without moving it.

The deadline covers the **whole** `callOpenAIStructured` call including the parse
retry, not each attempt. A per-attempt timer let one request run two full calls
back to back — double wall clock and double bill, invisible in the audit line.
Out of budget after attempt 1 means reporting that rejection, not starting a
second call the gateway cannot wait for.

Platform ceiling: Supabase returns 504 when a function has not responded within
150s (CPU time is capped at 2s but excludes time awaiting `fetch`), so the table
must leave room for the auth/quota/cache round trips around the call.

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
- `timeout` → the call exceeded `requestDeadlineMsFor(effort)`. If `latency_ms` sits right at
  that deadline, the effort is too high for the work (a 2-bullet summary does not need `xhigh`) —
  lower `OPENAI_REASONING_EFFORT` before raising the table. A timeout well _under_ the deadline
  points at egress or a cold start instead.
- `incomplete` + `max_output_tokens` → budget consumed before a usable result. `error_detail`
  carries both knobs (`max_output_tokens=… , effort=…`); raise `REASONING_HEADROOM_TOKENS`
  for that effort or lower `OPENAI_REASONING_EFFORT`. **This failure is billed** — the
  provider charged input + reasoning — so it is refunded to the user's quota but not to us.
- `refusal` → model declined; the request is not retried
- `parse` → JSON that passed `strict: true` but failed the feature validator, twice (or once,
  when the deadline had no room for a retry). `strict` already enforces types, enum, item counts,
  and string lengths, so the surviving checks are the prose rules JSON Schema cannot express —
  for `month_insight`, `hasExcessiveMoneyRepetition` and `hasInvalidMonthInsightAdvice`.
  `error_detail` carries the exact validator message; fix the **prompt** to state that constraint
  numerically, and bump `MONTH_INSIGHT_PROMPT_REV` so the cache does not serve stale bullets.

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
