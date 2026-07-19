import type { AiFeature } from './config.ts'

export type AiErrorCode =
  | 'unauthorized'
  | 'forbidden'
  | 'quota_exceeded'
  | 'flag_off'
  | 'validation'
  | 'upstream'
  | 'parse'

export interface AiGatewayRequest {
  feature: AiFeature
  ledgerId: string
  input: unknown
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

export interface AiGatewayErrorResponse {
  ok: false
  code: AiErrorCode
  message: string
}

export type AiGatewayResponse<T = unknown> = AiGatewayOkResponse<T> | AiGatewayErrorResponse

/** Successful claim_ai_quota payload — `day` is the KST day the reservation sits on. */
export interface ClaimQuotaOk {
  ok: true
  remaining_daily: number
  remaining_monthly: number
  remaining_tokens_month: number
  /**
   * KST calendar day the claim reserved (`YYYY-MM-DD`).
   * Must be passed to settle/refund so a request that crosses KST midnight
   * releases the same day's tokens_reserved instead of charging the next day.
   */
  day: string
  feature?: string
}

export interface ClaimQuotaDenied {
  ok: false
  reason?: 'daily' | 'monthly' | 'tokens' | 'unknown_feature'
  remaining_daily?: number
  remaining_monthly?: number
  remaining_tokens_month?: number
}

export type ClaimQuotaResult = ClaimQuotaOk | ClaimQuotaDenied

export interface XaiChatResult {
  content: unknown
  model: string
  promptTokens: number
  completionTokens: number
}

export interface AuditEntry {
  user_id: string
  feature: AiFeature
  model: string
  tokens: number
  latency_ms: number
  cached: boolean
  ledger_id: string
  ok: boolean
  code?: AiErrorCode
}

export const FUND_TYPES = ['income', 'expense', 'saving', 'investment'] as const
export type FundType = (typeof FUND_TYPES)[number]
