/**
 * ai-gateway control flow (docs/4 §4.5.1, §4.6.1).
 *
 * Order (quota claim only after gates pass):
 *   getUser → flag → opt-out → membership(minRole) → validate →
 *   cache? → claim → xAI → settle/refund → audit
 *
 * Injectable deps enable pure acceptance tests without Deno/Docker.
 */

import {
  CACHEABLE_FEATURES,
  FEATURE_MIN_ROLE,
  MAX_COMPLETION_TOKENS,
  RAW_BODY_MAX_BYTES,
  TOKEN_ESTIMATE,
  isAiFeaturesEnabled,
  modelForFeature,
  type AiFeature,
  type MinRole,
} from './config.ts'
import { MESSAGES, errorBody, httpStatusFor, quotaExceededMessage } from './errors.ts'
import type {
  AiGatewayOkResponse,
  AiGatewayResponse,
  AuditEntry,
  ClaimQuotaResult,
  XaiChatResult,
} from './types.ts'
import { parseGatewayBody, periodKeyFor, validateFeatureResult } from './validate.ts'
import { XaiError } from './xai.ts'

export interface CachedInsight {
  result: unknown
  model: string
}

export interface GatewayDeps {
  getUserId: (authHeader: string | null) => Promise<string | null>
  /** Raw env string for AI_FEATURES_ENABLED */
  aiFeaturesEnabledEnv: string | undefined | null
  /** true only when user may use in-app AI (row true). Missing row → false (dark launch). */
  isInAppAiEnabled: (userId: string) => Promise<boolean>
  isLedgerMember: (userId: string, ledgerId: string, minRole: MinRole) => Promise<boolean>
  lookupCache: (args: {
    ledgerId: string
    feature: AiFeature
    periodKey: string
    dataVersionHash: string
  }) => Promise<CachedInsight | null>
  claimQuota: (
    userId: string,
    feature: AiFeature,
    tokenEstimate: number,
  ) => Promise<ClaimQuotaResult>
  settleQuota: (
    userId: string,
    feature: AiFeature,
    promptTokens: number,
    completionTokens: number,
    tokenEstimate: number,
    /** KST day from claim; required so settle matches the reservation row. */
    claimDay: string,
  ) => Promise<void>
  refundQuota: (
    userId: string,
    feature: AiFeature,
    tokenEstimate: number,
    /** KST day from claim; required so refund matches the reservation row. */
    claimDay: string,
  ) => Promise<void>
  upsertCache: (args: {
    ledgerId: string
    feature: AiFeature
    periodKey: string
    dataVersionHash: string
    result: unknown
    model: string
  }) => Promise<void>
  callXai: (args: {
    feature: AiFeature
    input: unknown
    model: string
    maxTokens: number
  }) => Promise<XaiChatResult>
  logAudit: (entry: AuditEntry) => void
  nowMs: () => number
  /** Override body size limit (tests). */
  maxBodyBytes?: number
  /**
   * Optional model id override (production: `XAI_DEFAULT_MODEL` secret).
   * Empty/undefined → `DEFAULT_MODEL` in config.
   */
  defaultModel?: string | null
}

const CORS_HEADERS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

export function jsonResponse(body: AiGatewayResponse, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...CORS_HEADERS,
    },
  })
}

export function corsPreflightResponse(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export async function handleAiGateway(req: Request, deps: GatewayDeps): Promise<Response> {
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }
  if (req.method !== 'POST') {
    return jsonResponse(errorBody('validation', 'POST only'), 405)
  }

  const started = deps.nowMs()
  const authHeader = req.headers.get('Authorization')

  // ── body (size + JSON + feature limits) ──────────────────────────────────
  // Read as arrayBuffer first so we can enforce raw size before trusting text.
  let rawBytes: Uint8Array
  try {
    rawBytes = new Uint8Array(await req.arrayBuffer())
  } catch {
    return jsonResponse(errorBody('validation', MESSAGES.invalidJson), 400)
  }

  const maxBytes = deps.maxBodyBytes ?? RAW_BODY_MAX_BYTES
  if (rawBytes.byteLength > maxBytes) {
    return jsonResponse(errorBody('validation', MESSAGES.bodyTooLarge), 400)
  }

  const rawText = new TextDecoder().decode(rawBytes)
  const parsed = parseGatewayBody(rawText, rawBytes.byteLength, maxBytes)
  if (!parsed.ok) {
    return jsonResponse(errorBody('validation', parsed.message), 400)
  }

  const { feature, ledgerId, input, dataVersionHash } = parsed.value

  // ── auth ─────────────────────────────────────────────────────────────────
  const userId = await deps.getUserId(authHeader)
  if (!userId) {
    return jsonResponse(errorBody('unauthorized', MESSAGES.unauthorized), 401)
  }

  // ── global flag (before claim) ───────────────────────────────────────────
  if (!isAiFeaturesEnabled(deps.aiFeaturesEnabledEnv)) {
    return jsonResponse(errorBody('flag_off', MESSAGES.flagOff), 403)
  }

  // ── opt-out (before claim) ───────────────────────────────────────────────
  const inAppEnabled = await deps.isInAppAiEnabled(userId)
  if (!inAppEnabled) {
    return jsonResponse(errorBody('forbidden', MESSAGES.optedOut), 403)
  }

  // ── role / membership (before claim) ─────────────────────────────────────
  const minRole = FEATURE_MIN_ROLE[feature]
  const member = await deps.isLedgerMember(userId, ledgerId, minRole)
  if (!member) {
    return jsonResponse(errorBody('forbidden', MESSAGES.forbidden), 403)
  }

  // ── cache hit (no quota) ─────────────────────────────────────────────────
  const cacheable = CACHEABLE_FEATURES.has(feature)
  if (cacheable) {
    if (!dataVersionHash) {
      return jsonResponse(errorBody('validation', MESSAGES.missingHash), 400)
    }
    const periodKey = periodKeyFor(feature, input)
    if (!periodKey) {
      return jsonResponse(errorBody('validation', 'period key를 확인할 수 없습니다.'), 400)
    }
    const hit = await deps.lookupCache({
      ledgerId,
      feature,
      periodKey,
      dataVersionHash,
    })
    // Skip malformed cache rows (legacy poison or schema drift) and regenerate
    // instead of returning a shape that crashes the card until TTL expiry.
    if (hit && validateFeatureResult(feature, hit.result).ok) {
      const body: AiGatewayOkResponse = {
        ok: true,
        feature,
        result: hit.result,
        model: hit.model,
        usage: { promptTokens: 0, completionTokens: 0 },
        quota: { remainingDaily: -1, remainingMonthly: -1 },
        cached: true,
      }
      deps.logAudit({
        user_id: userId,
        feature,
        model: hit.model,
        tokens: 0,
        latency_ms: deps.nowMs() - started,
        cached: true,
        ledger_id: ledgerId,
        ok: true,
      })
      return jsonResponse(body, 200)
    }
  }

  // ── claim ────────────────────────────────────────────────────────────────
  const tokenEstimate = TOKEN_ESTIMATE[feature]
  const claim = await deps.claimQuota(userId, feature, tokenEstimate)
  if (!claim.ok) {
    const msg = quotaExceededMessage(claim.reason)
    return jsonResponse(errorBody('quota_exceeded', msg), 429)
  }
  // Pin settle/refund to this KST day. claim_ai_quota reserves on kst_today at
  // claim time; settle/refund must not recompute "today" after xAI returns or a
  // midnight-crossing call leaves tokens_reserved on the claim day forever.
  const claimDay = claim.day

  // ── xAI ──────────────────────────────────────────────────────────────────
  const model = modelForFeature(feature, deps.defaultModel)
  const maxTokens = MAX_COMPLETION_TOKENS[feature]
  let xai: XaiChatResult
  try {
    xai = await deps.callXai({ feature, input, model, maxTokens })
  } catch (e) {
    await safeRefund(deps, userId, feature, tokenEstimate, claimDay)
    const code = e instanceof XaiError && e.kind === 'parse' ? 'parse' : 'upstream'
    // Client always gets the generic Korean copy; ops get the real cause.
    const message = code === 'parse' ? MESSAGES.parse : MESSAGES.upstream
    const errorDetail =
      e instanceof XaiError
        ? e.message.slice(0, 400)
        : e instanceof Error
          ? e.message.slice(0, 400)
          : String(e).slice(0, 400)
    const upstreamStatus = e instanceof XaiError ? e.status : undefined
    const upstreamReason = e instanceof XaiError ? e.reason : code === 'parse' ? 'parse' : 'network'
    deps.logAudit({
      user_id: userId,
      feature,
      model,
      tokens: 0,
      latency_ms: deps.nowMs() - started,
      cached: false,
      ledger_id: ledgerId,
      ok: false,
      code,
      error_detail: errorDetail,
      upstream_status: upstreamStatus,
      upstream_reason: upstreamReason,
    })
    return jsonResponse(errorBody(code, message), httpStatusFor(code))
  }

  // ── settle ───────────────────────────────────────────────────────────────
  try {
    await deps.settleQuota(
      userId,
      feature,
      xai.promptTokens,
      xai.completionTokens,
      tokenEstimate,
      claimDay,
    )
  } catch {
    // Rare: xAI already billed; leave claim reserved rather than silent double-refund.
    // Still return result so UX is not blocked.
  }

  // ── cache upsert ─────────────────────────────────────────────────────────
  if (cacheable && dataVersionHash) {
    const periodKey = periodKeyFor(feature, input)
    if (periodKey) {
      try {
        await deps.upsertCache({
          ledgerId,
          feature,
          periodKey,
          dataVersionHash,
          result: xai.content,
          model: xai.model,
        })
      } catch {
        // non-fatal
      }
    }
  }

  const okBody: AiGatewayOkResponse = {
    ok: true,
    feature,
    result: xai.content,
    model: xai.model,
    usage: {
      promptTokens: xai.promptTokens,
      completionTokens: xai.completionTokens,
    },
    quota: {
      remainingDaily: claim.remaining_daily ?? 0,
      remainingMonthly: claim.remaining_monthly ?? 0,
    },
    cached: false,
  }

  deps.logAudit({
    user_id: userId,
    feature,
    model: xai.model,
    tokens: xai.promptTokens + xai.completionTokens,
    latency_ms: deps.nowMs() - started,
    cached: false,
    ledger_id: ledgerId,
    ok: true,
  })

  return jsonResponse(okBody, 200)
}

async function safeRefund(
  deps: GatewayDeps,
  userId: string,
  feature: AiFeature,
  tokenEstimate: number,
  claimDay: string,
): Promise<void> {
  try {
    await deps.refundQuota(userId, feature, tokenEstimate, claimDay)
  } catch {
    // best-effort
  }
}
