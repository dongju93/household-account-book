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
  achievements: [
    {
      name: '쇼핑',
      type: 'expense',
      target: 200_000,
      actual: 503_855,
      status: '초과',
      plannedExpenseSharePct: 8,
      actualExpenseSharePct: 20,
    },
    {
      name: '비상금',
      type: 'saving',
      target: 500_000,
      actual: 300_000,
      status: '진행중',
      plannedExpenseSharePct: null,
      actualExpenseSharePct: null,
    },
  ],
  topExpenses: [{ name: '쇼핑', amount: 503_855, pct: 20 }],
}

describe('monthInsightPrompt', () => {
  it('presents precomputed differences and budget-vs-actual spending shares', () => {
    const prompt = buildFeaturePrompt('month_insight', input)
    const match = prompt.user.match(/<monthly_data>\n(.+)\n<\/monthly_data>/)

    expect(match).not.toBeNull()
    const data = JSON.parse(match![1]) as {
      예산목표: Record<string, unknown>[]
    }

    expect(data.예산목표[0]).toMatchObject({
      목표: '₩200,000',
      실적: '₩503,855',
      초과분: '₩303,855',
      초과분값: 303_855,
      '목표 내 잔여액': '₩0',
      '목표 내 잔여액 값': 0,
      예산상지출비중퍼센트: 8,
      실제지출비중퍼센트: 20,
      비중차이퍼센트포인트: 12,
    })
    expect(data.예산목표[1]).toMatchObject({
      '목표까지 잔여액': '₩200,000',
      '목표까지 잔여액 값': 200_000,
    })
  })

  it('forbids the reported failure mode and allows fewer non-filler bullets', () => {
    const prompt = buildFeaturePrompt('month_insight', input)
    const schema = prompt.schema as {
      properties: { bullets: { minItems: number; maxItems: number } }
    }

    expect(prompt.system).toContain('초과분만큼 줄일 수 있는 대상은 다음 기간의 실제 지출')
    expect(prompt.system).toContain('계획 비중과 실제 비중의 차이')
    expect(prompt.system).toContain('고액·반복·일회성 결제')
    expect(prompt.system).toContain('목표·실적·초과분을 모두 금액으로 반복하지 마세요')
    expect(prompt.system).toContain('예산을 ₩303,855 초과했고')
    expect(prompt.system).toContain('예산상 전체 지출의 8%로 계획됐지만 실제로는 20%')
    expect(prompt.user).toContain('초과분 금액을 한 번 밝히고')
    expect(prompt.user).toContain('근거 없는 비교·유지·희생')
    expect(prompt.system).toContain('한도를 초과분 규모로 축소')
    expect(prompt.system).not.toContain('식비 한도만 초과분 규모로 재설계')
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
