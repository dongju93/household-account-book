/**
 * ai-gateway control flow (docs/4 §4.5.1, §4.6.1).
 *
 * Order (quota claim only after gates pass):
 *   getUser → flag → opt-out → membership(minRole) → validate →
 *   cache? → claim → OpenAI → settle/refund → audit
 *
 * Injectable deps enable pure acceptance tests without Deno/Docker.
 */

import {
  CACHEABLE_FEATURES,
  FEATURE_MIN_ROLE,
  RAW_BODY_MAX_BYTES,
  isAiFeaturesEnabled,
  maxOutputTokensFor,
  tokenEstimateFor,
  type AiFeature,
  type MinRole,
  type OpenAIModel,
  type OpenAIReasoningEffort,
} from './config.ts'
import { MESSAGES, errorBody, httpStatusFor, quotaExceededMessage } from './errors.ts'
import { OpenAIError } from './openai.ts'
import type {
  AiGatewayOkResponse,
  AiGatewayResponse,
  AuditEntry,
  ClaimQuotaResult,
  OpenAIResult,
} from './types.ts'
import { parseGatewayBody, periodKeyFor, validateFeatureResult } from './validate.ts'

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
  callOpenAI: (args: {
    feature: AiFeature
    input: unknown
    model: OpenAIModel
    /** Wire `max_output_tokens`: reasoning + visible output, never visible-only. */
    maxOutputTokens: number
    reasoningEffort: OpenAIReasoningEffort
    /** Hashed user id — the raw UUID must not leave this service. */
    safetyIdentifier: string
  }) => Promise<OpenAIResult>
  logAudit: (entry: AuditEntry) => void
  nowMs: () => number
  /** Override body size limit (tests). */
  maxBodyBytes?: number
  /** Required deployment model, parsed from `OPENAI_MODEL`. */
  model: OpenAIModel
  /** Required reasoning effort, parsed from `OPENAI_REASONING_EFFORT`. */
  reasoningEffort: OpenAIReasoningEffort
}

/**
 * Domain separation for the provider-facing user hash. Not a secret — the point
 * is that OpenAI never receives `auth.users.id`, which also keys our audit log
 * and every RLS policy. Changing this string re-anonymizes every user.
 */
const SAFETY_IDENTIFIER_NAMESPACE = 'household-account-book:ai-gateway:v1:'

/** Stable opaque per-user id for OpenAI abuse tracking — never the raw UUID. */
export async function safetyIdentifierFor(userId: string): Promise<string> {
  const bytes = new TextEncoder().encode(`${SAFETY_IDENTIFIER_NAMESPACE}${userId}`)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
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

  const model = deps.model
  const effort = deps.reasoningEffort
  // Hashed before any quota is claimed: a failure here must not strand a
  // reservation, and the raw user id must never reach the provider.
  const safetyIdentifier = await safetyIdentifierFor(userId)

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
    if (hit && hit.model === model && validateFeatureResult(feature, hit.result).ok) {
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
  // Reserve prompt + visible output + typical reasoning spend: reasoning tokens
  // are billed as output, so an effort-blind estimate under-claims and lets a
  // user run past the monthly cap mid-request.
  const tokenEstimate = tokenEstimateFor(feature, effort)
  const claim = await deps.claimQuota(userId, feature, tokenEstimate)
  if (!claim.ok) {
    const msg = quotaExceededMessage(claim.reason)
    return jsonResponse(errorBody('quota_exceeded', msg), 429)
  }
  // Pin settle/refund to this KST day. claim_ai_quota reserves on kst_today at
  // claim time; settle/refund must not recompute "today" after OpenAI returns or a
  // midnight-crossing call leaves tokens_reserved on the claim day forever.
  const claimDay = claim.day

  // ── OpenAI ───────────────────────────────────────────────────────────────
  // `max_output_tokens` covers reasoning + visible output, so the budget must be
  // derived from the effort — a visible-only budget truncates mid-reasoning and
  // returns `incomplete` with nothing usable, already billed.
  const maxOutputTokens = maxOutputTokensFor(feature, effort)
  let openai: OpenAIResult
  try {
    openai = await deps.callOpenAI({
      feature,
      input,
      model,
      maxOutputTokens,
      reasoningEffort: effort,
      safetyIdentifier,
    })
  } catch (e) {
    await safeRefund(deps, userId, feature, tokenEstimate, claimDay)
    const code = e instanceof OpenAIError && e.kind === 'parse' ? 'parse' : 'upstream'
    // Client always gets the generic Korean copy; ops get the real cause.
    const message = code === 'parse' ? MESSAGES.parse : MESSAGES.upstream
    const errorDetail =
      e instanceof OpenAIError
        ? e.message.slice(0, 400)
        : e instanceof Error
          ? e.message.slice(0, 400)
          : String(e).slice(0, 400)
    const upstreamStatus = e instanceof OpenAIError ? e.status : undefined
    const upstreamReason =
      e instanceof OpenAIError ? e.reason : code === 'parse' ? 'parse' : 'network'
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
      openai.promptTokens,
      openai.completionTokens,
      tokenEstimate,
      claimDay,
    )
  } catch {
    // Rare: OpenAI already billed; leave claim reserved rather than silent double-refund.
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
          result: openai.content,
          model: openai.model,
        })
      } catch {
        // non-fatal
      }
    }
  }

  const okBody: AiGatewayOkResponse = {
    ok: true,
    feature,
    result: openai.content,
    model: openai.model,
    usage: {
      promptTokens: openai.promptTokens,
      completionTokens: openai.completionTokens,
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
    model: openai.model,
    tokens: openai.promptTokens + openai.completionTokens,
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
