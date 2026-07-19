/**
 * Feature matrix, hard limits, and model defaults for ai-gateway.
 * Spec: docs/4 §4.5.1, §4.6, §4.8.1, §4.8.4
 */

export const RAW_BODY_MAX_BYTES = 32 * 1024
export const XAI_TIMEOUT_MS = 20_000
export const XAI_BASE_URL = 'https://api.x.ai/v1'
export const DEFAULT_MODEL = 'grok-4.3'
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

export function modelForFeature(feature: AiFeature): string {
  // Flagship only for rare deep chat failures later; P1 default is still grok-4.3.
  void feature
  return DEFAULT_MODEL
}

/** Global kill switch: only explicit "true" enables paid calls (dark launch safe). */
export function isAiFeaturesEnabled(envValue: string | undefined | null): boolean {
  return (envValue ?? '').trim().toLowerCase() === 'true'
}
