/**
 * Feature matrix, hard limits, and model defaults for ai-gateway.
 * Spec: docs/4 §4.5.1, §4.6, §4.8.1, §4.8.4
 */

export const RAW_BODY_MAX_BYTES = 32 * 1024
export const OPENAI_BASE_URL = 'https://api.openai.com/v1'
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const CACHE_TRIM_KEEP = 20

/**
 * Disclosure/provider revision required for effective in-app AI opt-in.
 * Keep in sync with `AI_DISCLOSURE_VERSION` in `src/ai/types.ts`.
 * Bump when the named foreign processor or disclosure material changes.
 */
export const AI_DISCLOSURE_VERSION = 'openai-1'

/** True only when the stored flag is on and disclosure matches the current revision. */
export function isEffectiveInAppAiOptIn(
  enabled: boolean | null | undefined,
  disclosureVersion: string | null | undefined,
): boolean {
  return enabled === true && disclosureVersion === AI_DISCLOSURE_VERSION
}

export const OPENAI_MODELS = ['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'] as const
export type OpenAIModel = (typeof OPENAI_MODELS)[number]

/**
 * Reasoning effort accepted by `OPENAI_REASONING_EFFORT`.
 * Mirrors the Responses API enum (`none` … `max`); the API notes not every
 * reasoning model supports every value, so a rejected value surfaces as
 * `upstream` HTTP 400 rather than being caught here.
 */
export const OPENAI_REASONING_EFFORTS = [
  'none',
  'minimal',
  'low',
  'medium',
  'high',
  'xhigh',
  'max',
] as const
export type OpenAIReasoningEffort = (typeof OPENAI_REASONING_EFFORTS)[number]

export type AiFeature =
  | 'nl_txn_parse'
  | 'category_suggest'
  | 'month_insight'
  | 'period_explain'
  | 'month_close_narrative'
  | 'budget_recommend'
  | 'chat_turn'

export type MinRole = 'viewer' | 'editor' | 'owner'

export const AI_FEATURES: readonly AiFeature[] = [
  'nl_txn_parse',
  'category_suggest',
  'month_insight',
  'period_explain',
  'month_close_narrative',
  'budget_recommend',
  'chat_turn',
] as const

/** Minimum ledger role per feature (§4.5.1). */
export const FEATURE_MIN_ROLE: Record<AiFeature, MinRole> = {
  nl_txn_parse: 'editor',
  category_suggest: 'editor',
  budget_recommend: 'editor',
  month_insight: 'viewer',
  period_explain: 'viewer',
  month_close_narrative: 'viewer',
  chat_turn: 'viewer',
}

/** Cacheable features: hit skips quota claim (§4.4, §4.8.5). */
export const CACHEABLE_FEATURES: ReadonlySet<AiFeature> = new Set([
  'month_insight',
  'period_explain',
  'month_close_narrative',
])

/**
 * Pre-claim token estimate for the prompt + visible completion (§4.8.1).
 * Not the reservation itself — reasoning spend is added by `tokenEstimateFor`.
 */
export const TOKEN_ESTIMATE: Record<AiFeature, number> = {
  nl_txn_parse: 500,
  category_suggest: 300,
  month_insight: 750,
  period_explain: 1000,
  month_close_narrative: 650,
  budget_recommend: 800,
  chat_turn: 2000,
}

/**
 * Visible (non-reasoning) output each feature's JSON result needs.
 * Never send this as `max_output_tokens` — use `maxOutputTokensFor`.
 */
export const VISIBLE_OUTPUT_TOKENS: Record<AiFeature, number> = {
  nl_txn_parse: 400,
  category_suggest: 300,
  month_insight: 500,
  period_explain: 600,
  month_close_narrative: 500,
  budget_recommend: 500,
  chat_turn: 800,
}

/**
 * Reasoning headroom added on top of the visible budget, per effort.
 *
 * The Responses API counts reasoning tokens against `max_output_tokens`, so a
 * budget sized for the visible JSON alone gets consumed during reasoning and
 * returns `status:"incomplete"` (`reason:"max_output_tokens"`) with **no**
 * output — after the provider already billed input + reasoning tokens. OpenAI
 * advises reserving ≥25k tokens for reasoning + output.
 *
 * This is a ceiling, not an allocation: unused headroom is never generated and
 * never billed. Cost is bounded by the quota system, not by this number.
 */
export const REASONING_HEADROOM_TOKENS: Record<OpenAIReasoningEffort, number> = {
  none: 0,
  minimal: 1_000,
  low: 4_000,
  medium: 8_000,
  high: 16_000,
  xhigh: 25_000,
  max: 32_000,
}

/**
 * Typical reasoning spend reserved at claim time, per effort.
 * Lower than the headroom ceiling on purpose: this is the expected case, and
 * `settle_ai_quota` replaces it with actuals once the response lands.
 */
export const REASONING_ESTIMATE_TOKENS: Record<OpenAIReasoningEffort, number> = {
  none: 0,
  minimal: 250,
  low: 1_000,
  medium: 2_000,
  high: 4_000,
  xhigh: 6_000,
  max: 8_000,
}

/**
 * The only supported way to compute `max_output_tokens` for a request.
 * Takes the effort because the wire budget is meaningless without it.
 */
export function maxOutputTokensFor(feature: AiFeature, effort: OpenAIReasoningEffort): number {
  return VISIBLE_OUTPUT_TOKENS[feature] + REASONING_HEADROOM_TOKENS[effort]
}

/** The only supported way to compute the pre-call quota reservation. */
export function tokenEstimateFor(feature: AiFeature, effort: OpenAIReasoningEffort): number {
  return TOKEN_ESTIMATE[feature] + REASONING_ESTIMATE_TOKENS[effort]
}

/**
 * Wall-clock budget for one `callOpenAIStructured` call, per effort.
 *
 * The deadline belongs to the same decision as `REASONING_HEADROOM_TOKENS`: a
 * flat timeout permits a token budget the gateway will never wait for. At
 * `high` the wire budget is ~16.5k tokens, which no model emits inside 20s, so
 * every request that actually used its reasoning allowance aborted as
 * `upstream`/`timeout` after the provider had already started billing.
 *
 * This is the budget for the whole call including the parse retry, not per
 * attempt — see `callOpenAIStructured`.
 *
 * Ceiling: Supabase returns 504 if the function has not responded within 150s
 * (CPU time is capped separately at 2s but excludes time awaiting `fetch`), so
 * the largest value here must leave room for the auth/quota/cache round trips
 * around the call — measured at roughly one second.
 */
export const REQUEST_DEADLINE_MS: Record<OpenAIReasoningEffort, number> = {
  none: 20_000,
  minimal: 25_000,
  low: 35_000,
  medium: 50_000,
  high: 75_000,
  xhigh: 100_000,
  max: 120_000,
}

/** The only supported way to build the request deadline. */
export function requestDeadlineMsFor(effort: OpenAIReasoningEffort): number {
  return REQUEST_DEADLINE_MS[effort]
}

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === 'string' && (AI_FEATURES as readonly string[]).includes(value)
}

/** Parse the required deployment model once at the environment boundary. */
export function parseOpenAIModel(value: string): OpenAIModel {
  const model = value.trim()
  if (!(OPENAI_MODELS as readonly string[]).includes(model)) {
    throw new Error(`OPENAI_MODEL must be one of: ${OPENAI_MODELS.join(', ')}`)
  }
  return model as OpenAIModel
}

/** Parse the required reasoning effort at the environment boundary. */
export function parseOpenAIReasoningEffort(value: string): OpenAIReasoningEffort {
  const effort = value.trim()
  if (!(OPENAI_REASONING_EFFORTS as readonly string[]).includes(effort)) {
    throw new Error(
      `OPENAI_REASONING_EFFORT must be one of: ${OPENAI_REASONING_EFFORTS.join(', ')}`,
    )
  }
  return effort as OpenAIReasoningEffort
}

/** Global kill switch: only explicit "true" enables paid calls (dark launch safe). */
export function isAiFeaturesEnabled(envValue: string | undefined | null): boolean {
  return (envValue ?? '').trim().toLowerCase() === 'true'
}
