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
import { parseGatewayBody, validateGatewayEnvelope } from './validate.ts'
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
      ok: true,
      remaining_daily: 39,
      remaining_monthly: 399,
      remaining_tokens_month: 199500,
    }),
    settleQuota: async () => {},
    refundQuota: async () => {},
    upsertCache: async () => {},
    callXai: async () => ({
      content: { ok: true },
      model: 'grok-4.3',
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
        result: { bullets: ['캐시'], groundedMonth: '2026-07' },
        model: 'grok-4.3',
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

  it('upstream 실패 시 refund', async () => {
    const deps = makeDeps({
      callXai: async () => {
        throw new XaiError('upstream', 'boom')
      },
    })
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(502)
    expect((await res.json()).code).toBe('upstream')
    expect(deps.claims).toBe(1)
    expect(deps.refunds).toBe(1)
    expect(deps.settles).toBe(0)
  })

  it('성공 경로: claim → xAI → settle', async () => {
    const deps = makeDeps()
    const res = await postJson(baseNlBody(), deps)
    expect(res.status).toBe(200)
    const json = await res.json()
    expect(json.ok).toBe(true)
    expect(json.feature).toBe('nl_txn_parse')
    expect(deps.claims).toBe(1)
    expect(deps.xaiCalls).toBe(1)
    expect(deps.settles).toBe(1)
    expect(deps.refunds).toBe(0)
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
