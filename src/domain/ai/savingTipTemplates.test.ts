import { describe, expect, it } from 'vite-plus/test'

import { buildSavingTipTemplates, pickSavingTip, type TipAchievement } from './savingTipTemplates'

const foodOver: TipAchievement = {
  name: '식비',
  type: 'expense',
  status: '초과',
  remaining: -50_000,
  target: 300_000,
  actual: 350_000,
  pct: 117,
}
const busOver: TipAchievement = {
  name: '교통',
  type: 'expense',
  status: '초과',
  remaining: -10_000,
  target: 100_000,
  actual: 110_000,
  pct: 110,
}
const leisureWarn: TipAchievement = {
  name: '여가',
  type: 'expense',
  status: '주의',
  remaining: 20_000,
  target: 200_000,
  actual: 180_000,
  pct: 90,
}
const transportOk: TipAchievement = {
  name: '대중교통',
  type: 'expense',
  status: '정상',
  remaining: 60_000,
  target: 150_000,
  actual: 90_000,
  pct: 60,
}

const baseSummary = {
  balance: 100_000,
  totalIncome: 3_000_000,
  totalExpense: 1_200_000,
  totalSaving: 500_000,
}

describe('buildSavingTipTemplates', () => {
  it('closed month names the category with the largest overspend first', () => {
    const tips = buildSavingTipTemplates({
      period: 'closed',
      summary: baseSummary,
      achievements: [busOver, foodOver],
    })

    expect(tips[0]).toBe(
      '이번 달 가장 큰 절약 필요 항목은 식비입니다. 예산을 ₩50,000 초과했으므로 다음 달 한도를 우선 재조정하세요.',
    )
    expect(tips.some((t) => t.includes('예산 초과 2곳') && t.includes('식비'))).toBe(true)
  })

  it('closed month falls back to the largest expense when nothing exceeded budget', () => {
    const tips = buildSavingTipTemplates({
      period: 'closed',
      summary: baseSummary,
      achievements: [transportOk],
      topExpenses: [
        { name: '주거', amount: 900_000, pct: 45 },
        { name: '대중교통', amount: 90_000, pct: 4.5 },
      ],
    })

    expect(tips[0]).toBe(
      '이번 달 가장 큰 절약 후보는 주거(₩900,000, 지출의 45%)입니다. 다음 달 예산을 짤 때 이 항목의 한도를 먼저 점검하세요.',
    )
  })

  it('current month excludes over-budget categories and names an adjustable warning first', () => {
    const tips = buildSavingTipTemplates({
      period: 'current',
      summary: { ...baseSummary, balance: -100_000 },
      achievements: [foodOver, leisureWarn],
      topExpenses: [
        { name: '식비', amount: 350_000, pct: 40 },
        { name: '여가', amount: 180_000, pct: 21 },
      ],
    })

    expect(tips[0]).toBe(
      '남은 기간 가장 먼저 절약할 항목은 여가입니다. 예산이 ₩20,000 남았으므로 추가 지출을 이 범위 안에서 관리하세요.',
    )
    expect(tips[0]).not.toContain('식비')
    // Pool still includes an overspend context tip for rotation.
    expect(tips.some((t) => t.includes('식비') && t.includes('초과'))).toBe(true)
  })

  it('current month selects the largest non-over expense when no category is at warning', () => {
    const tips = buildSavingTipTemplates({
      period: 'current',
      summary: baseSummary,
      achievements: [foodOver, transportOk],
      topExpenses: [
        { name: '식비', amount: 350_000, pct: 40 },
        { name: '대중교통', amount: 90_000, pct: 10 },
      ],
    })

    expect(tips[0]).toBe(
      '남은 기간 절약 우선 항목은 대중교통(₩90,000, 지출의 10%)입니다. 이미 쓴 금액보다 추가 지출을 줄이는 데 집중하세요.',
    )
  })

  it('current month still emits an overspend tip when every spent category is already over budget', () => {
    const tips = buildSavingTipTemplates({
      period: 'current',
      summary: baseSummary,
      achievements: [foodOver, busOver],
      topExpenses: [
        { name: '식비', amount: 350_000, pct: 70 },
        { name: '교통', amount: 110_000, pct: 22 },
      ],
    })

    expect(tips.length).toBeGreaterThan(0)
    expect(tips.some((t) => t.includes('예산 초과 2곳') && t.includes('식비'))).toBe(true)
  })
})

describe('pickSavingTip', () => {
  it('rotates through the pool and wraps', () => {
    const pool = ['a', 'b', 'c']
    expect(pickSavingTip(pool, 0)).toBe('a')
    expect(pickSavingTip(pool, 1)).toBe('b')
    expect(pickSavingTip(pool, 2)).toBe('c')
    expect(pickSavingTip(pool, 3)).toBe('a')
    expect(pickSavingTip(pool, -1)).toBe('c')
  })

  it('returns null for an empty pool', () => {
    expect(pickSavingTip([], 0)).toBeNull()
  })
})
