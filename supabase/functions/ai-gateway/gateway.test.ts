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
import {
  parseGatewayBody,
  validateFeatureInput,
  validateFeatureResult,
  validateGatewayEnvelope,
} from './validate.ts'
import { XaiError } from './xai.ts'

const LEDGER = '11111111-1111-4111-8111-111111111111'
const USER = '22222222-2222-4222-8222-222222222222'
const VALID_INSIGHT_BULLETS = [
  '쇼핑 지출은 입력된 목표와 실적을 비교해 다음 달 목표 이내로 맞추는 행동을 제안합니다.',
  '저축은 수지와 목표까지 남은 금액 안에서 실제로 배정 가능한 범위만 안내합니다.',
  '상위 지출 비중은 삭감 근거가 아니라 다음 달 중간 점검의 우선순위로만 활용합니다.',
]

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
        // Schema requires 2–4 bullets; this cached result is valid.
        result: {
          bullets: VALID_INSIGHT_BULLETS,
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
          bullets: VALID_INSIGHT_BULLETS,
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
    expect(json.result.bullets).toEqual(VALID_INSIGHT_BULLETS)
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

describe('validateFeatureInput period_explain', () => {
  const baseInput = {
    periodKey: '3m:2026-03_2026-05',
    months: [{ month: '2026-03', income: 1, expense: 1, saving: 0, investment: 0, balance: 0 }],
  }

  it('rejects empty months', () => {
    const r = validateFeatureInput('period_explain', { ...baseInput, months: [] })
    expect(r.ok).toBe(false)
  })

  it('accepts input without topCategories', () => {
    const r = validateFeatureInput('period_explain', baseInput)
    expect(r.ok).toBe(true)
  })

  it('rejects a month whose balance contradicts its fund totals', () => {
    const r = validateFeatureInput('period_explain', {
      ...baseInput,
      months: [{ ...baseInput.months[0], balance: 999 }],
    })
    expect(r.ok).toBe(false)
  })

  it('accepts progress for the latest partial month and rejects a mismatched month', () => {
    const progress = { asOf: '2026-03-20', dayOfMonth: 20, daysInMonth: 31 }
    const ok = validateFeatureInput('period_explain', { ...baseInput, progress })
    const mismatch = validateFeatureInput('period_explain', {
      ...baseInput,
      progress: { ...progress, asOf: '2026-04-20' },
    })

    expect(ok.ok).toBe(true)
    expect(mismatch.ok).toBe(false)
  })

  it('rejects more than 5 topCategories', () => {
    const topCategories = Array.from({ length: 6 }, (_, i) => ({
      name: `cat-${i}`,
      amount: 1000,
      pct: 10,
    }))
    const r = validateFeatureInput('period_explain', { ...baseInput, topCategories })
    expect(r.ok).toBe(false)
  })

  it('rejects malformed topCategories items', () => {
    const r = validateFeatureInput('period_explain', {
      ...baseInput,
      topCategories: [{ name: '', amount: 1000, pct: 10 }],
    })
    expect(r.ok).toBe(false)
  })

  it('accepts a 40-char name but rejects a longer one (categories.name is 1..40)', () => {
    const ok = validateFeatureInput('period_explain', {
      ...baseInput,
      topCategories: [{ name: 'ㄱ'.repeat(40), amount: 1000, pct: 10 }],
    })
    expect(ok.ok).toBe(true)

    const tooLong = validateFeatureInput('period_explain', {
      ...baseInput,
      topCategories: [{ name: 'ㄱ'.repeat(41), amount: 1000, pct: 10 }],
    })
    expect(tooLong.ok).toBe(false)
  })

  it('counts astral characters like PostgreSQL length(), not UTF-16 units', () => {
    // 21 emoji = 21 code points (DB-legal under length(name) <= 40) but JS length 42.
    const emojiName = '🎉'.repeat(21)
    expect(emojiName.length).toBe(42)

    const ok = validateFeatureInput('period_explain', {
      ...baseInput,
      topCategories: [{ name: emojiName, amount: 1000, pct: 10 }],
    })
    expect(ok.ok).toBe(true)

    // 41 code points is over the DB limit regardless of encoding.
    const tooLong = validateFeatureInput('period_explain', {
      ...baseInput,
      topCategories: [{ name: '🎉'.repeat(41), amount: 1000, pct: 10 }],
    })
    expect(tooLong.ok).toBe(false)
  })

  it('accepts domain-computed recent category changes', () => {
    const r = validateFeatureInput('period_explain', {
      ...baseInput,
      categoryChanges: [
        {
          name: '식비',
          previousAmount: 300000,
          latestAmount: 180000,
          delta: -120000,
          deltaPct: -40,
        },
      ],
    })
    expect(r.ok).toBe(true)
  })

  it('rejects malformed recent category changes', () => {
    const r = validateFeatureInput('period_explain', {
      ...baseInput,
      categoryChanges: [
        {
          name: '식비',
          previousAmount: 300000,
          latestAmount: 180000,
          delta: '감소',
          deltaPct: -40,
        },
      ],
    })
    expect(r.ok).toBe(false)
  })

  it('rejects a category delta that contradicts its monthly amounts', () => {
    const r = validateFeatureInput('period_explain', {
      ...baseInput,
      categoryChanges: [
        {
          name: '식비',
          previousAmount: 300000,
          latestAmount: 180000,
          delta: -100000,
          deltaPct: -40,
        },
      ],
    })
    expect(r.ok).toBe(false)
  })
})

describe('DB-mirroring length limits count code points', () => {
  it('nl_txn_parse accepts a 40-code-point emoji category name', () => {
    const emojiName = '🎉'.repeat(40)
    expect(emojiName.length).toBe(80)

    const ok = validateFeatureInput('nl_txn_parse', {
      text: '어제 스타벅스 4500원',
      today: '2026-07-11',
      categories: [{ id: 'c1', name: emojiName, type: 'expense' }],
    })
    expect(ok.ok).toBe(true)

    const tooLong = validateFeatureInput('nl_txn_parse', {
      text: '어제 스타벅스 4500원',
      today: '2026-07-11',
      categories: [{ id: 'c1', name: '🎉'.repeat(41), type: 'expense' }],
    })
    expect(tooLong.ok).toBe(false)
  })

  it('category_suggest accepts a 200-code-point emoji memo', () => {
    const emojiMemo = '🎉'.repeat(200)
    expect(emojiMemo.length).toBe(400)

    const ok = validateFeatureInput('category_suggest', {
      memo: emojiMemo,
      categories: [{ id: 'c1', name: '식비', type: 'expense' }],
    })
    expect(ok.ok).toBe(true)

    const tooLong = validateFeatureInput('category_suggest', {
      memo: '🎉'.repeat(201),
      categories: [{ id: 'c1', name: '식비', type: 'expense' }],
    })
    expect(tooLong.ok).toBe(false)
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
  it('accepts a period interpretation with actionable advice', () => {
    const r = validateFeatureResult('period_explain', {
      bullets: [
        '최근 달에는 지출 감소와 수지 개선이 함께 나타났지만, 식비 감소가 일회성인지 반복 가능한 변화인지는 거래 내역 확인이 필요합니다.',
        '식비의 최근 거래를 반복 지출과 일회성 지출로 구분해 감소 원인을 확인하고, 다음 달에도 적용할 지출 규칙 하나를 정하면 완료입니다.',
      ],
      periodKey: '3m:2026-03_2026-05',
    })
    expect(r.ok).toBe(true)
  })

  it('rejects a period result that omits interpretation or falls back to short filler', () => {
    const noInterpretation = validateFeatureResult('period_explain', {
      bullets: [
        '식비 거래를 확인하고 다음 달 규칙을 정하세요.',
        '식비 거래를 확인하고 다음 달 규칙을 정하세요.',
      ],
      periodKey: '3m:2026-03_2026-05',
    })
    const shortAdvice = validateFeatureResult('period_explain', {
      bullets: [
        '최근 달에는 지출 감소와 수지 개선이 함께 나타났지만, 같은 변화가 반복될지는 거래 내역 확인이 필요합니다.',
        '절약하세요.',
      ],
      periodKey: '3m:2026-03_2026-05',
    })

    expect(noInterpretation.ok).toBe(false)
    expect(shortAdvice.ok).toBe(false)
  })

  it('accepts a well-formed month_insight result', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: VALID_INSIGHT_BULLETS,
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

  it('accepts two useful bullets without forcing filler', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: VALID_INSIGHT_BULLETS.slice(0, 2),
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(true)
  })

  it('rejects too few bullets', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: VALID_INSIGHT_BULLETS.slice(0, 1),
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects advice that reduces a budget limit by the overspend amount', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: [
        '쇼핑 한도를 초과분 규모로 축소하고 식비·모임은 현재 수준 그대로 유지하세요.',
        '쇼핑 지출은 다음 달 기존 목표 이내로 맞추고 월 중간에 실적을 다시 확인하세요.',
      ],
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(false)
  })

  it('rejects bullets that repeat target, actual, and overspend amounts', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: [
        '쇼핑 지출이 ₩503,855로 목표 ₩200,000을 ₩303,855 초과했으니 다음 달에는 ₩200,000 이내로 맞추세요.',
        '쇼핑은 예산상 계획 비중보다 실제 지출 비중이 높으므로 이번 달 소비 내역을 확인하세요.',
      ],
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(false)
  })

  it('accepts reducing actual spending while keeping the existing limit', () => {
    const r = validateFeatureResult('month_insight', {
      bullets: [
        '쇼핑 한도 ₩200,000은 유지하고 다음 달 실제 지출을 이번 달보다 ₩303,855 줄이세요.',
        '쇼핑 지출은 다음 달 기존 목표 이내로 맞추고 월 중간에 실적을 다시 확인하세요.',
      ],
      groundedMonth: '2026-07',
    })
    expect(r.ok).toBe(true)
  })

  it('accepts an actionable month-close decision plan', () => {
    const r = validateFeatureResult('month_close_narrative', {
      summary:
        '이번 마감은 중복 거래 여부를 먼저 확정한 뒤 식비 초과의 성격을 구분하는 순서가 핵심입니다.',
      actions: [
        '6월 14일 식비 거래가 실제 이중 입력인지 결제 내역과 대조하고, 중복이면 한 건을 삭제하며 정상 거래면 유지 사유를 메모하면 확인 완료입니다.',
        '식비 내역을 반복 지출과 일회성 지출로 나누어 보고, 다음 달 시작 전 반복 지출 규칙을 정하거나 일회성 비용을 반영해 예산 조정 여부를 확정하세요.',
      ],
      groundedMonth: '2026-06',
    })
    expect(r.ok).toBe(true)
  })

  it('rejects a month-close result that falls back to a short information list', () => {
    const r = validateFeatureResult('month_close_narrative', {
      summary: '식비 초과, 저축 미달',
      actions: ['식비를 주의하세요.'],
      groundedMonth: '2026-06',
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
