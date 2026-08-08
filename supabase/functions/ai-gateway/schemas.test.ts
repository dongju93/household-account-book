import { describe, expect, it } from 'vitest'

import { buildFeaturePrompt } from './schemas.ts'

const input = {
  month: '2026-06',
  summary: {
    totalIncome: 3_000_000,
    totalExpense: 2_500_000,
    totalSaving: 300_000,
    totalInvestment: 0,
    balance: 200_000,
  },
  totalExpenseBudget: 2_400_000,
  achievements: [
    {
      name: '쇼핑',
      type: 'expense',
      target: 200_000,
      actual: 503_855,
      status: '초과',
    },
    {
      name: '비상금',
      type: 'saving',
      target: 500_000,
      actual: 300_000,
      status: '진행중',
    },
  ],
  topExpenses: [{ name: '쇼핑', amount: 503_855, pct: 20 }],
}

describe('monthInsightPrompt', () => {
  it('presents server-computed differences without derived share metrics', () => {
    const prompt = buildFeaturePrompt('month_insight', input)
    const match = prompt.user.match(/<monthly_data>\n(.+)\n<\/monthly_data>/)

    expect(match).not.toBeNull()
    const data = JSON.parse(match![1]) as {
      요약: Record<string, unknown>
      예산목표: Record<string, unknown>[]
    }

    expect(data.요약).toMatchObject({ 지출예산합계: { 표시: '₩2,400,000', 값: 2_400_000 } })
    expect(data.예산목표[0]).toMatchObject({
      목표: '₩200,000',
      실적: '₩503,855',
      초과분: '₩303,855',
      초과분값: 303_855,
      '목표 내 잔여액': '₩0',
      '목표 내 잔여액 값': 0,
    })
    // Plan-vs-actual share is gone from the achievement rows; the 상위지출
    // composition figure stays because it mirrors the dashboard's own pie chart.
    expect(JSON.stringify(data.예산목표)).not.toContain('비중')
    expect(data.예산목표[1]).toMatchObject({
      '목표까지 잔여액': '₩200,000',
      '목표까지 잔여액 값': 200_000,
    })
  })

  it('marks an in-progress month with elapsed days, and omits it once closed', () => {
    const dataOf = (prompt: { user: string }) =>
      JSON.parse(prompt.user.match(/<monthly_data>\n(.+)\n<\/monthly_data>/)![1]) as {
        진행?: Record<string, unknown>
      }

    expect('진행' in dataOf(buildFeaturePrompt('month_insight', input))).toBe(false)

    const open = buildFeaturePrompt('month_insight', {
      ...input,
      progress: { asOf: '2026-06-03', dayOfMonth: 3, daysInMonth: 30 },
    })
    expect(dataOf(open).진행).toEqual({ 기준일: '2026-06-03', 경과일: 3, 총일수: 30 })
  })

  /**
   * The prompt must guide tone, scope, and required content — not hand the model a
   * metric to apply. A precomputed plan-vs-actual share comparison was the source of
   * the "실제 지출 비중이 계획보다" claim firing on in-budget, early-month spending.
   */
  it('guides judgement instead of prescribing a metric', () => {
    const prompt = buildFeaturePrompt('month_insight', input)
    const instructions = prompt.user.split('<monthly_data>')[0]
    const schema = prompt.schema as {
      properties: { bullets: { minItems: number; maxItems: number } }
    }

    expect(prompt.system).toContain('무엇이 중요한 근거인지는 당신이 판단합니다')
    expect(prompt.system).toContain('경과일이 적을수록 분모가 작아')
    expect(prompt.system).toContain('목표를 넘지 않은 지출은 그 자체로 문제가 아닙니다')
    expect(prompt.system).toContain('줄일 수 있는 대상은 앞으로의 실제 지출')
    expect(prompt.system).toContain('초과분 금액을 한 번 밝힙니다')
    expect(prompt.system).toContain('# 톤 앤 매너')
    expect(prompt.system).toContain('# 다뤄야 할 범위')
    expect(prompt.system).toContain('# 반드시 포함할 것')
    expect(instructions).toContain('특정 지표를 억지로 끼워 맞추지 마세요')
    expect(instructions).toContain('근거 없는 비교·유지·희생')
    // No prescribed share comparison anywhere in the instructions.
    expect(prompt.system).not.toContain('계획 비중')
    expect(prompt.system).not.toContain('퍼센트포인트')
    expect(instructions).not.toContain('비중')
    expect(schema.properties.bullets).toMatchObject({ minItems: 2, maxItems: 4 })
  })
})

describe('periodExplainPrompt', () => {
  const periodInput = {
    periodKey: '3m:2026-03_2026-05',
    progress: { asOf: '2026-05-20', dayOfMonth: 20, daysInMonth: 31 },
    months: [
      {
        month: '2026-04',
        income: 3_200_000,
        expense: 1_600_000,
        saving: 600_000,
        investment: 300_000,
        balance: 700_000,
      },
      {
        month: '2026-05',
        income: 3_100_000,
        expense: 1_400_000,
        saving: 500_000,
        investment: 300_000,
        balance: 900_000,
      },
    ],
    topCategories: [{ name: '식비', amount: 800_000, pct: 50 }],
    categoryChanges: [
      {
        name: '식비',
        previousAmount: 300_000,
        latestAmount: 180_000,
        delta: -120_000,
        deltaPct: -40,
      },
    ],
  }

  it('presents domain-computed trends in Korean display values', () => {
    const prompt = buildFeaturePrompt('period_explain', periodInput)
    const match = prompt.user.match(/<period_data>\n(.+)\n<\/period_data>/)

    expect(match).not.toBeNull()
    const data = JSON.parse(match![1]) as {
      진행: Record<string, unknown>
      월별흐름: Record<string, unknown>[]
      기간상위지출: Record<string, unknown>[]
      최근월카테고리변화: Record<string, unknown>[]
    }

    expect(data.진행).toEqual({ 기준일: '2026-05-20', 경과일: 20, 총일수: 31 })
    expect(data.월별흐름[1]).toMatchObject({ 지출: '₩1,400,000', 수지: '₩900,000' })
    expect(data.기간상위지출[0]).toEqual({
      카테고리: '식비',
      기간지출: '₩800,000',
      기간지출비중: '50%',
    })
    expect(data.최근월카테고리변화[0]).toEqual({
      카테고리: '식비',
      이전달: '₩300,000',
      최근달: '₩180,000',
      변화액: '-₩120,000',
      변화율: '-40%',
    })
  })

  it('requires interpretation and concrete advice instead of generic bullets', () => {
    const prompt = buildFeaturePrompt('period_explain', periodInput)
    const schema = prompt.schema as {
      required: string[]
      properties: {
        bullets: { minItems: number; maxItems: number }
      }
    }

    expect(prompt.system).toContain('표에 보이는 값을 다시 읽어주는 것이 아니라')
    expect(prompt.system).toContain('서로 다른 근거 두 개 이상을 연결')
    expect(prompt.system).toContain('마지막 달의 감소를 개선으로, 증가를 악화로 단정하지 마세요')
    expect(prompt.system).toContain('근거와 판단 이유 → 확인하거나 바꿀 행동 → 완료 기준')
    expect(prompt.system).toContain('새 숫자를 계산하거나 만들지 마세요')
    expect(prompt.system).toContain('상위 지출이라는 이유만으로 무조건 줄이라고 하지 않습니다')
    expect(schema.required).toEqual(['bullets', 'periodKey'])
    expect(schema.properties.bullets).toMatchObject({ minItems: 2, maxItems: 4 })
  })
})

describe('monthClosePrompt', () => {
  it('turns findings into prioritized decisions instead of restating the list', () => {
    const prompt = buildFeaturePrompt('month_close_narrative', {
      month: '2026-06',
      needsCheck: [
        {
          kind: 'duplicate_candidate',
          label: '2026-06-14 식비 ₩32,000 거래가 2건 반복되었습니다.',
        },
        { kind: 'over_budget', label: '식비 카테고리가 예산을 ₩120,000 초과했습니다.' },
      ],
      forReference: [
        { kind: 'under_saving_goal', label: '비상금 저축 목표에 ₩200,000 못 미쳤습니다.' },
      ],
      truncated: false,
    })
    const schema = prompt.schema as {
      required: string[]
      properties: {
        summary: { minLength: number; maxLength: number }
        actions: { minItems: number; maxItems: number }
      }
    }

    expect(prompt.system).toContain('입력 항목을 다시 나열하거나 요약하는 것이 아니라')
    expect(prompt.system).toContain('왜 우선인지 → 무엇을 확인하거나 바꿀지 → 언제 완료로 볼지')
    expect(prompt.system).toContain('중복이라고 단정하지 말고')
    expect(prompt.system).toContain('반복 지출과 일회성 지출을 구분')
    expect(prompt.system).toContain('서로 다른 finding 사이의 인과관계를 만들지 않습니다')
    expect(prompt.system).toContain('막연한 표현')
    expect(prompt.user).toContain('<month_close_data>')
    expect(schema.required).toEqual(['summary', 'actions', 'groundedMonth'])
    expect(schema.properties.summary).toMatchObject({ minLength: 25, maxLength: 180 })
    expect(schema.properties.actions).toMatchObject({ minItems: 1, maxItems: 3 })
  })
})
