import { describe, expect, it } from 'vite-plus/test'

import { buildSavingTipTemplates, type TipAchievement } from './savingTipTemplates'

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
  it('closed month names the category with the largest overspend', () => {
    const tips = buildSavingTipTemplates({
      period: 'closed',
      summary: baseSummary,
      achievements: [busOver, foodOver],
    })

    expect(tips).toEqual([
      '이번 달 가장 큰 절약 필요 항목은 식비입니다. 예산을 ₩50,000 초과했으므로 다음 달 한도를 우선 재조정하세요.',
    ])
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

    expect(tips).toEqual([
      '이번 달 가장 큰 절약 후보는 주거(₩900,000, 지출의 45%)입니다. 다음 달 예산을 짤 때 이 항목의 한도를 먼저 점검하세요.',
    ])
  })

  it('current month excludes over-budget categories and names an adjustable warning', () => {
    const tips = buildSavingTipTemplates({
      period: 'current',
      summary: { ...baseSummary, balance: -100_000 },
      achievements: [foodOver, leisureWarn],
      topExpenses: [
        { name: '식비', amount: 350_000, pct: 40 },
        { name: '여가', amount: 180_000, pct: 21 },
      ],
    })

    expect(tips).toEqual([
      '남은 기간 가장 먼저 절약할 항목은 여가입니다. 예산이 ₩20,000 남았으므로 추가 지출을 이 범위 안에서 관리하세요.',
    ])
    expect(tips[0]).not.toContain('식비')
    expect(tips[0]).not.toContain('초과')
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

    expect(tips).toEqual([
      '남은 기간 절약 우선 항목은 대중교통(₩90,000, 지출의 10%)입니다. 이미 쓴 금액보다 추가 지출을 줄이는 데 집중하세요.',
    ])
  })

  it('current month emits no tip when every spent category is already over budget', () => {
    const tips = buildSavingTipTemplates({
      period: 'current',
      summary: baseSummary,
      achievements: [foodOver, busOver],
      topExpenses: [
        { name: '식비', amount: 350_000, pct: 70 },
        { name: '교통', amount: 110_000, pct: 22 },
      ],
    })

    expect(tips).toEqual([])
  })
})
