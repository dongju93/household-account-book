/**
 * Feature matrix, hard limits, and model defaults for ai-gateway.
 * Spec: docs/4 §4.5.1, §4.6, §4.8.1, §4.8.4
 */

export const RAW_BODY_MAX_BYTES = 32 * 1024
export const XAI_TIMEOUT_MS = 20_000
export const XAI_BASE_URL = 'https://api.x.ai/v1'
/**
 * Default chat model for paid gateway features.
 * Prefer a model every billed team can use; ops can override per deploy via
 * secret `XAI_DEFAULT_MODEL` without a code change (team model access varies).
 * Note: `grok-4.3` is documented publicly but is not enabled for all teams —
 * a 404 "model does not exist or your team … does not have access" maps to
 * HTTP 502 `code: "upstream"` from this gateway.
 */
export const DEFAULT_MODEL = 'grok-4.5'
export const FLAGSHIP_MODEL = 'grok-4.5'
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000
export const CACHE_TRIM_KEEP = 20

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

/** Pre-claim token estimate (§4.8.1 est. tokens/req). */
export const TOKEN_ESTIMATE: Record<AiFeature, number> = {
  nl_txn_parse: 500,
  category_suggest: 300,
  month_insight: 750,
  period_explain: 1000,
  month_close_narrative: 650,
  budget_recommend: 800,
  chat_turn: 2000,
}

/** max_tokens for xAI completion (output budget, not claim estimate). */
export const MAX_COMPLETION_TOKENS: Record<AiFeature, number> = {
  nl_txn_parse: 400,
  category_suggest: 300,
  month_insight: 500,
  period_explain: 600,
  month_close_narrative: 500,
  budget_recommend: 500,
  chat_turn: 800,
}

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === 'string' && (AI_FEATURES as readonly string[]).includes(value)
}

/**
 * Resolve the model id for a feature.
 * @param envDefault - optional `XAI_DEFAULT_MODEL` (trimmed); empty → code default
 */
export function modelForFeature(feature: AiFeature, envDefault?: string | null): string {
  // Per-feature flagship routing reserved for P1 chat; all features share one default today.
  void feature
  const fromEnv = (envDefault ?? '').trim()
  return fromEnv || DEFAULT_MODEL
}

/** Global kill switch: only explicit "true" enables paid calls (dark launch safe). */
export function isAiFeaturesEnabled(envValue: string | undefined | null): boolean {
  return (envValue ?? '').trim().toLowerCase() === 'true'
}
