import { describe, expect, it } from 'vite-plus/test'

import { formatPaceHint } from '../budgetPace'
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
const foodWarn: TipAchievement = {
  name: '식비',
  type: 'expense',
  status: '주의',
  remaining: 20_000,
  target: 300_000,
  actual: 280_000,
  pct: 93,
}
const foodOk: TipAchievement = {
  name: '식비',
  type: 'expense',
  status: '정상',
  remaining: 100_000,
  target: 300_000,
  actual: 200_000,
  pct: 67,
}
const emerNear: TipAchievement = {
  name: '비상금',
  type: 'saving',
  status: '근접',
  remaining: 20_000,
  target: 500_000,
  actual: 480_000,
  pct: 96,
}
const houseNear: TipAchievement = {
  name: '주택청약',
  type: 'saving',
  status: '근접',
  remaining: 5_000,
  target: 100_000,
  actual: 95_000,
  pct: 95,
}
const emerLag: TipAchievement = {
  name: '비상금',
  type: 'saving',
  status: '진행중',
  remaining: 200_000,
  target: 500_000,
  actual: 300_000,
  pct: 60,
}

const baseSummary = {
  balance: 100_000,
  totalIncome: 3_000_000,
  totalExpense: 1_200_000,
  totalSaving: 500_000,
}

describe('buildSavingTipTemplates', () => {
  it('pairs negative balance with the worst overspend for a recovery action', () => {
    const tips = buildSavingTipTemplates({
      summary: { ...baseSummary, balance: -42_500 },
      achievements: [busOver, foodOver],
    })
    expect(tips[0]).toBe(
      '수지 ₩42,500 부족 · 식비 초과분 ₩50,000을 먼저 줄이면 적자 상당 부분을 메울 수 있습니다.',
    )
    // Second tip names remaining overspend (food already covered in #1).
    expect(tips[1]).toMatch(/교통/)
    expect(tips[1]).toMatch(/₩10,000/)
  })

  it('suggests checking variable spend when deficit has no overspend rows', () => {
    const tips = buildSavingTipTemplates({
      summary: { ...baseSummary, balance: -42_500 },
      achievements: [foodOk],
    })
    expect(tips[0]).toBe(
      '수지 ₩42,500 부족 · 변동 지출을 한 카테고리씩 줄이거나, 수입·이체 누락이 없는지 확인하세요.',
    )
  })

  it('does not emit deficit tip when non-negative', () => {
    expect(
      buildSavingTipTemplates({ summary: { ...baseSummary, balance: 0 }, achievements: [] }).some(
        (t) => t.includes('부족'),
      ),
    ).toBe(false)
  })

  it('names a single over-budget category with a concrete recovery action', () => {
    const tips = buildSavingTipTemplates({
      summary: baseSummary,
      achievements: [foodOver, foodOk],
    })
    expect(tips[0]).toBe(
      '식비 예산을 ₩50,000 초과했습니다. 남은 기간 해당 지출을 멈추거나 설정에서 예산을 현실화하세요.',
    )
  })

  it('summarizes multiple over-budget categories by worst overspend', () => {
    const tips = buildSavingTipTemplates({
      summary: baseSummary,
      achievements: [busOver, foodOver],
    })
    expect(tips[0]).toBe(
      '예산 초과 2곳 · 최대는 식비(₩50,000). 초과 큰 항목부터 한도를 다시 잡으세요.',
    )
  })

  it('warns on 주의 status with usage pct when nothing is over budget', () => {
    const tips = buildSavingTipTemplates({
      summary: baseSummary,
      achievements: [foodWarn],
    })
    expect(tips[0]).toBe(
      '식비 예산을 이미 93% 사용했습니다. 월말 전 한도를 넘기지 않도록 남은 지출을 계획하세요.',
    )
  })

  it('gives a near-goal saving tip with remaining amount (closest first)', () => {
    const tips = buildSavingTipTemplates({
      summary: baseSummary,
      achievements: [emerNear, houseNear],
    })
    // houseNear has smaller remaining → higher priority among near-goal
    expect(tips[0]).toBe(
      '주택청약 목표까지 ₩5,000 · 이번 달 잔여에서 우선 배정하면 달성에 가깝습니다.',
    )
  })

  it('redirects surplus toward a lagging saving goal', () => {
    const tips = buildSavingTipTemplates({
      summary: { ...baseSummary, balance: 80_000 },
      achievements: [emerLag],
    })
    expect(tips[0]).toBe('흑자 ₩80,000 중 ₩80,000을 비상금에 배정하면 목표 진척이 눈에 띕니다.')
  })

  it('flags top-expense concentration at ≥35% share', () => {
    const tips = buildSavingTipTemplates({
      summary: baseSummary,
      achievements: [foodOk],
      topExpenses: [{ name: '주거', amount: 900_000, pct: 45 }],
    })
    expect(tips[0]).toBe(
      '지출의 45%가 주거(₩900,000)에 몰려 있습니다. 한도·절감 효과가 가장 큰 축입니다.',
    )
  })

  it('emits a healthy-month habit tip only when no stronger signal', () => {
    const tips = buildSavingTipTemplates({
      summary: { ...baseSummary, balance: 200_000, totalExpense: 500_000 },
      achievements: [foodOk],
    })
    expect(tips).toHaveLength(1)
    expect(tips[0]).toMatch(/흑자 ₩200,000/)
    expect(tips[0]).toMatch(/자동 이체/)
  })

  it('caps at 3 tips and keeps priority (deficit → overspend follow-up → near goal)', () => {
    const tips = buildSavingTipTemplates({
      summary: { ...baseSummary, balance: -1_000 },
      achievements: [foodOver, busOver, emerNear, houseNear],
      topExpenses: [{ name: '식비', amount: 400_000, pct: 50 }],
    })
    expect(tips).toHaveLength(3)
    expect(tips[0]).toMatch(/수지 ₩1,000 부족/)
    expect(tips[0]).toMatch(/식비/)
    expect(tips[1]).toMatch(/교통/)
    expect(tips[2]).toMatch(/목표까지/)
  })

  it('never duplicates formatPaceHint daily-allowance wording', () => {
    const tips = buildSavingTipTemplates({
      summary: { ...baseSummary, balance: -5_000 },
      achievements: [foodOver, emerNear],
    })
    const paceCopy = formatPaceHint({
      daysRemaining: 10,
      dailyAllowance: 5_000,
      remainingBudget: 50_000,
    })
    expect(paceCopy).toMatch(/^남은 \d+일 · 하루 ₩/)
    for (const tip of tips) {
      expect(tip).not.toMatch(/남은 \d+일/)
      expect(tip).not.toMatch(/하루 ₩/)
      expect(tip).not.toBe(paceCopy)
    }
  })
})
