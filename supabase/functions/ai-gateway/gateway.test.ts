/**
 * Acceptance tests for ai-gateway control flow (docs/4-1 S02).
 * Pure mock deps — no Docker / xAI / Deno required.
 *
 * Run: pnpm exec vp test run supabase/functions/ai-gateway/gateway.test.ts
 */

import { describe, expect, it } from 'vitest'

import {
  CACHEABLE_FEATURES,
  FEATURE_MIN_ROLE,
  RAW_BODY_MAX_BYTES,
  TOKEN_ESTIMATE,
} from './config.ts'
import { handleAiGateway, type GatewayDeps } from './gateway.ts'
import { parseGatewayBody, validateFeatureResult, validateGatewayEnvelope } from './validate.ts'
import { XaiError } from './xai.ts'

const LEDGER = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'

function baseNlBody(over: Record<string, unknown> = {}) {
  return {
    feature: 'nl_txn_parse',
    ledgerId: LEDGER,
    input: {
      text: '어제 스타벅스 4500원 식비',
      today: '2026-07-11',
      categories: [{ id: 'c1', name: '식비', type: 'expense' }],
    },
    ...over,
  }
}

function insightBody(over: Record<string, unknown> = {}) {
  return {
    feature: 'month_insight',
    ledgerId: LEDGER,
    dataVersionHash: 'abc123hash',
    input: {
      month: '2026-07',
      summary: {
        incomeTotal: 100,
        expenseTotal: 50,
        savingTotal: 10,
        investmentTotal: 0,
        balance: 40,
      },
      achievements: [],
      topExpenses: [{ name: '식비', amount: 50, pct: 100 }],
    },
    ...over,
  }
}

type TrackedDeps = GatewayDeps & {
  claims: number
  refunds: number
  settles: number
  xaiCalls: number
}

function makeDeps(partial: Partial<GatewayDeps> = {}): TrackedDeps {
  const counters = { claims: 0, refunds: 0, settles: 0, xaiCalls: 0 }

  const deps: TrackedDeps = {
    claims: 0,
    refunds: 0,
    settles: 0,
    xaiCalls: 0,
    aiFeaturesEnabledEnv: 'true',
    getUserId: async (h) => (h?.toLowerCase().startsWith('bearer ') ? USER : null),
    isInAppAiEnabled: async () => true,
    isLedgerMember: async () => true,
    lookupCache: async () => null,
    claimQuota: async () => ({
      ok: true as const,
      remaining_daily: 39,
      remaining_monthly: 399,
      remaining_tokens_month: 199500,
      // Claim-day pin: settle/refund must receive this exact KST day.
      day: '2026-07-11',
    }),
    settleQuota: async () => {},
    refundQuota: async () => {},
    upsertCache: async () => {},
    callXai: async () => ({
      content: { ok: true },
      model: 'grok-4.5',
      promptTokens: 10,
      completionTokens: 5,
    }),
    logAudit: () => {},
    nowMs: () => 1_000_000,
    ...partial,
  }

  const claimInner = deps.claimQuota
  deps.claimQuota = async (...args) => {
    counters.claims++
    deps.claims = counters.claims
    return claimInner(...args)
  }
  const refundInner = deps.refundQuota
  deps.refundQuota = async (...args) => {
    counters.refunds++
    deps.refunds = counters.refunds
    return refundInner(...args)
  }
  const settleInner = deps.settleQuota
  deps.settleQuota = async (...args) => {
    counters.settles++
    deps.settles = counters.settles
    return settleInner(...args)
  }
  const xaiInner = deps.callXai
  deps.callXai = async (...args) => {
    counters.xaiCalls++
    deps.xaiCalls = counters.xaiCalls
    return xaiInner(...args)
  }

  return deps
}

async function postJson(
  body: unknown,
  deps: GatewayDeps,
  opts: { auth?: boolean } = { auth: true },
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (opts.auth !== false) headers.Authorization = 'Bearer test-jwt'
  const req = new Request('http://localhost/functions/v1/ai-gateway', {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  return handleAiGateway(req, deps)
}

describe('S02 ai-gateway acceptance', () => {
  it('무JWT → unauthorized (claim 전)', async () => {
    const deps = makeDeps()
    const res = await postJson(baseNlBody(), deps, { auth: false })
    expect(res.status).toBe(401)
    const json = await res.json()
    expect(json.ok).toBe(false)
    expect(json.code).toBe('unauthorized')
    expect(deps.claims).toBe(0)
    expect(deps.xaiCalls).toBe(0)
  })

  it('옵트아웃 → forbidden (claim 전)', async () => {
    const deps = makeDeps({ isInAppAiEnabled: async () => false })
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('forbidden')
    expect(deps.claims).toBe(0)
    expect(deps.xaiCalls).toBe(0)
  })

  it('역할 부족 / 타 ledger → forbidden (claim 전)', async () => {
    const deps = makeDeps({ isLedgerMember: async () => false })
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('forbidden')
    expect(deps.claims).toBe(0)
    expect(deps.xaiCalls).toBe(0)
  })

  it('payload 초과 → validation (xAI·claim 없음)', async () => {
    const deps = makeDeps()
    const huge = 'x'.repeat(RAW_BODY_MAX_BYTES + 1)
    const req = new Request('http://localhost/functions/v1/ai-gateway', {
      method: 'POST',
      headers: {
        Authorization: 'Bearer test-jwt',
        'Content-Type': 'application/json',
      },
      body: huge,
    })
    const res = await handleAiGateway(req, deps)
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation')
    expect(deps.claims).toBe(0)
    expect(deps.xaiCalls).toBe(0)
  })

  it('feature field limit (text>200) → validation, no claim', async () => {
    const deps = makeDeps()
    const res = await postJson(
      baseNlBody({
        input: {
          text: '가'.repeat(201),
          today: '2026-07-11',
          categories: [{ id: 'c1', name: '식비', type: 'expense' }],
        },
      }),
      deps,
    )
    expect(res.status).toBe(400)
    expect((await res.json()).code).toBe('validation')
    expect(deps.claims).toBe(0)
  })

  it('쿼터 초과 → 429 + 한국어 메시지', async () => {
    const deps = makeDeps({
      claimQuota: async () => ({ ok: false, reason: 'daily' }),
    })
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(429)
    const json = await res.json()
    expect(json.code).toBe('quota_exceeded')
    expect(json.message).toContain('오늘')
    expect(json.message).toContain('한도')
    expect(deps.xaiCalls).toBe(0)
  })

  it('월 쿼터 초과 메시지는 이번 달 문구', async () => {
    const deps = makeDeps({
      claimQuota: async () => ({ ok: false, reason: 'monthly' }),
    })
    const res = await postJson(baseNlBody(), deps)
    expect((await res.json()).message).toContain('이번 달')
  })

  it('캐시 히트 시 quota 미차감 (cacheable feature)', async () => {
    const deps = makeDeps({
      lookupCache: async () => ({
        // Schema requires 3–4 bullets; shorter rows are invalid and must not hit.
        result: {
          bullets: ['캐시 불릿 1', '캐시 불릿 2', '캐시 불릿 3'],
          groundedMonth: '2026-07',
        },
        model: 'grok-4.5',
      }),
    })
    const res = await postJson(insightBody(), deps)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.cached).toBe(true)
    expect(deps.claims).toBe(0)
    expect(deps.xaiCalls).toBe(0)
  })

  it('malformed cache row is treated as miss (regenerate, not serve poison)', async () => {
    const deps = makeDeps({
      lookupCache: async () => ({
        // Valid JSON historically cached, but bullets is not a string[].
        result: { bullets: 'not-an-array', groundedMonth: '2026-07' },
        model: 'grok-4.5',
      }),
      callXai: async () => ({
        content: {
          bullets: ['재생성 불릿 1', '재생성 불릿 2', '재생성 불릿 3'],
          groundedMonth: '2026-07',
        },
        model: 'grok-4.5',
        promptTokens: 10,
        completionTokens: 5,
      }),
    })
    const res = await postJson(insightBody(), deps)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.cached).toBe(false)
    expect(json.result.bullets).toEqual([
      '재생성 불릿 1',
      '재생성 불릿 2',
      '재생성 불릿 3',
    ])
    expect(deps.claims).toBe(1)
    expect(deps.xaiCalls).toBe(1)
    expect(deps.settles).toBe(1)
  })

  it('upstream 실패 시 refund', async () => {
    let refundDay: string | undefined
    let audit:
      | { code?: string; error_detail?: string; upstream_status?: number; upstream_reason?: string }
      | undefined
    const deps = makeDeps({
      callXai: async () => {
        throw new XaiError('upstream', 'xAI HTTP 401: Incorrect API key', {
          status: 401,
          reason: 'http',
        })
      },
      refundQuota: async (_userId, _feature, _estimate, claimDay) => {
        refundDay = claimDay
      },
      logAudit: (entry) => {
        audit = entry
      },
    })
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(502)
    const json = await res.json()
    expect(json.code).toBe('upstream')
    // Client body stays generic — no provider status/body leak.
    expect(json.message).not.toContain('401')
    expect(json.message).not.toContain('API key')
    expect(deps.claims).toBe(1)
    expect(deps.refunds).toBe(1)
    expect(deps.settles).toBe(0)
    // Refund must use claim day, not a recomputed completion-day kst_today.
    expect(refundDay).toBe('2026-07-11')
    // Ops audit must carry the real cause so Dashboard logs are actionable.
    expect(audit?.code).toBe('upstream')
    expect(audit?.upstream_status).toBe(401)
    expect(audit?.upstream_reason).toBe('http')
    expect(audit?.error_detail).toContain('401')
  })

  it('성공 경로: claim → xAI → settle', async () => {
    let settleDay: string | undefined
    const deps = makeDeps({
      settleQuota: async (_u, _f, _p, _c, _e, claimDay) => {
        settleDay = claimDay
      },
    })
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.feature).toBe('nl_txn_parse')
    expect(deps.claims).toBe(1)
    expect(deps.xaiCalls).toBe(1)
    expect(deps.settles).toBe(1)
    expect(deps.refunds).toBe(0)
    // Settle must use claim day so a midnight-crossing xAI call releases the
    // same day's tokens_reserved (P2 claim-day settlement).
    expect(settleDay).toBe('2026-07-11')
  })

  it('settle/refund use claim day even when claim day ≠ wall-clock today', async () => {
    // Simulates claim just before KST midnight and settle/refund after: the
    // gateway must forward the claim-returned day, not invent a new one.
    const claimDay = '2026-07-31'
    let settleDay: string | undefined
    let refundDay: string | undefined

    const settleDeps = makeDeps({
      claimQuota: async () => ({
        ok: true as const,
        remaining_daily: 1,
        remaining_monthly: 10,
        remaining_tokens_month: 1000,
        day: claimDay,
      }),
      settleQuota: async (_u, _f, _p, _c, _e, day) => {
        settleDay = day
      },
    })
    const okRes = await postJson(baseNlBody(), settleDeps)
    expect(okRes.status).toBe(200)
    expect(settleDay).toBe(claimDay)

    const refundDeps = makeDeps({
      claimQuota: async () => ({
        ok: true as const,
        remaining_daily: 1,
        remaining_monthly: 10,
        remaining_tokens_month: 1000,
        day: claimDay,
      }),
      callXai: async () => {
        throw new XaiError('upstream', 'timeout')
      },
      refundQuota: async (_u, _f, _e, day) => {
        refundDay = day
      },
    })
    const failRes = await postJson(baseNlBody(), refundDeps)
    expect(failRes.status).toBe(502)
    expect(refundDay).toBe(claimDay)
  })

  it('flag_off when AI_FEATURES_ENABLED is not true', async () => {
    const deps = makeDeps({ aiFeaturesEnabledEnv: 'false' })
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(403)
    expect((await res.json()).code).toBe('flag_off')
    expect(deps.claims).toBe(0)
  })
})

describe('validate envelope', () => {
  it('rejects invalid ledgerId', () => {
    const r = validateGatewayEnvelope(baseNlBody({ ledgerId: 'not-uuid' }))
    expect(r.ok).toBe(false)
  })

  it('accepts valid nl body', () => {
    const r = validateGatewayEnvelope(baseNlBody())
    expect(r.ok).toBe(true)
  })

  it('parseGatewayBody rejects oversize before deep parse', () => {
    const raw = 'x'.repeat(100)
    const r = parseGatewayBody(raw, RAW_BODY_MAX_BYTES + 10, RAW_BODY_MAX_BYTES)
    expect(r.ok).toBe(false)
  })
})

describe('feature matrix sanity', () => {
  it('nl_txn_parse is editor; month_insight is viewer', () => {
    expect(FEATURE_MIN_ROLE.nl_txn_parse).toBe('editor')
    expect(FEATURE_MIN_ROLE.month_insight).toBe('viewer')
  })

  it('cacheable set matches design', () => {
    expect(CACHEABLE_FEATURES.has('month_insight')).toBe(true)
    expect(CACHEABLE_FEATURES.has('nl_txn_parse')).toBe(false)
  })

  it('token estimates align with §4.8.1', () => {
    expect(TOKEN_ESTIMATE.nl_txn_parse).toBe(500)
    expect(TOKEN_ESTIMATE.month_insight).toBe(750)
  })
})

describe('validateFeatureResult (structured output schema)', () => {
  it('accepts a well-formed month_insight result', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: ['a', 'b', 'c'],
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(true)
  })

  it('rejects non-array bullets (would crash AiInsightCard map)', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: 'oops',
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects too few bullets', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: ['first', 'second'],
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(false)
  })

  it('accepts nl_txn_parse with null draft fields', () => {
    const r = validateFeatureResult('nl_txn_parse', {
      draft: {
        amount: null,
        type: null,
        categoryName: null,
        date: null,
        memo: null,
      },
      confidence: 'low',
      warnings: ['금액 불명'],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects nl_txn_parse missing draft', () => {
    const r = validateFeatureResult('nl_txn_parse', {
      confidence: 'high',
      warnings: [],
    })
    expect(r.ok).toBe(false)
  })
})
