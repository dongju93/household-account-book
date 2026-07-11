/**
 * Client ↔ Edge `ai-gateway` contract (docs/4 §7.1–7.2, §4.8.4).
 * Keep in sync with `supabase/functions/ai-gateway/{types,config,validate}.ts`.
 */

import type { FundType } from '../domain/fundType'
import type { MonthSummary } from '../domain/monthSummary'
import type { ExpenseStatus, SavingStatus } from '../domain/types'

// ── Feature ids ──────────────────────────────────────────────────────────────

export type AiFeature =
  | 'nl_txn_parse'
  | 'category_suggest'
  | 'month_insight'
  | 'period_explain'
  | 'month_close_narrative'
  | 'budget_recommend'
  | 'chat_turn'

export const AI_FEATURES: readonly AiFeature[] = [
  'nl_txn_parse',
  'category_suggest',
  'month_insight',
  'period_explain',
  'month_close_narrative',
  'budget_recommend',
  'chat_turn',
] as const

/** Cacheable features require `dataVersionHash`; hit skips quota claim. */
export const CACHEABLE_FEATURES: ReadonlySet<AiFeature> = new Set([
  'month_insight',
  'period_explain',
  'month_close_narrative',
])

export function isAiFeature(value: unknown): value is AiFeature {
  return typeof value === 'string' && (AI_FEATURES as readonly string[]).includes(value)
}

// ── Error codes (Edge contract) ──────────────────────────────────────────────

export type AiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'quota_exceeded'
  | 'flag_off'
  | 'validation'
  | 'upstream'
  | 'parse'

export const AI_ERROR_CODES: readonly AiErrorCode[] = [
  'unauthorized',
  'forbidden',
  'quota_exceeded',
  'flag_off',
  'validation',
  'upstream',
  'parse',
] as const

export function isAiErrorCode(value: unknown): value is AiErrorCode {
  return typeof value === 'string' && (AI_ERROR_CODES as readonly string[]).includes(value)
}

// ── Payload hard limits (docs/4 §4.8.4) — mirror Edge for client pre-checks ──

export const AI_LIMITS = {
  rawBodyMaxBytes: 32 * 1024,
  nlTxnParse: {
    textMax: 200,
    categoriesMax: 80,
    categoryNameMax: 40,
  },
  categorySuggest: {
    memoMax: 200,
    categoriesMax: 80,
  },
  monthInsight: {
    achievementsMax: 40,
    paceMax: 40,
    topExpensesMax: 5,
  },
  periodExplain: {
    periodKeyMax: 32,
    monthsMax: 12,
  },
  monthCloseNarrative: {
    findingsMax: 40,
  },
  budgetRecommend: {
    categoriesMax: 80,
  },
  chatTurn: {
    messagesMax: 12,
    contentMax: 500,
    contextMaxBytes: 8 * 1024,
  },
  dataVersionHashMax: 128,
} as const

// ── Envelope ─────────────────────────────────────────────────────────────────

export interface AiGatewayRequest {
  feature: AiFeature
  ledgerId: string
  /** Feature-specific payload; never include secrets or raw ledger dumps beyond caps. */
  input: unknown
  /** Client-computed hash for cacheable features (Edge rejects missing hash). */
  dataVersionHash?: string
}

export interface AiGatewayOkResponse<T = unknown> {
  ok: true
  feature: AiFeature
  result: T
  model: string
  usage: { promptTokens: number; completionTokens: number }
  quota: { remainingDaily: number; remainingMonthly: number }
  cached?: boolean
}

export interface AiGatewayErrorBody {
  ok: false
  code: AiErrorCode
  message: string
}

export type AiGatewayResponse<T = unknown> = AiGatewayOkResponse<T> | AiGatewayErrorBody

// ── Feature payloads (docs/4 §7.2) ───────────────────────────────────────────

export interface NlTxnParseInput {
  text: string
  today: string // YYYY-MM-DD
  categories: { id: string; name: string; type: FundType }[]
}

export interface NlTxnParseResult {
  draft: {
    amount: number | null
    type: FundType | null
    categoryName: string | null
    date: string | null
    memo: string | null
  }
  confidence: 'high' | 'medium' | 'low'
  warnings: string[]
}

export interface MonthInsightInput {
  month: string // YYYY-MM
  summary: MonthSummary
  achievements: {
    name: string
    type: 'expense' | 'saving'
    target: number
    actual: number
    status: ExpenseStatus | SavingStatus
  }[]
  pace?: {
    name: string
    remainingBudget: number
    daysRemaining: number
    dailyAllowance: number
    status: ExpenseStatus
  }[]
  topExpenses: { name: string; amount: number; pct: number }[]
}

export interface MonthInsightResult {
  bullets: string[]
  groundedMonth: string
}

export interface MonthCloseNarrativeInput {
  month: string
  needsCheck: { kind: string; label: string }[]
  forReference: { kind: string; label: string }[]
  truncated: boolean
}

export interface MonthCloseNarrativeResult {
  narrative: string
  groundedMonth: string
}
