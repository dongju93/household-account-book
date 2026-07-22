import { won } from '../../lib/format'
import type { AchievementRow } from '../achievement'
import type { MonthSummary } from '../monthSummary'

/** Achievement fields needed for actionable tips. */
export type TipAchievement = Pick<
  AchievementRow,
  'name' | 'type' | 'status' | 'remaining' | 'target' | 'actual' | 'pct'
>

export type TipTopExpense = {
  name: string
  amount: number
  /** Share of total expense, 0–100. */
  pct: number
}

export interface SavingTipInput {
  period: 'current' | 'closed'
  summary: Pick<MonthSummary, 'balance' | 'totalIncome' | 'totalExpense' | 'totalSaving'>
  achievements: readonly TipAchievement[]
  /** Optional; when present, concentration tips can fire. */
  topExpenses?: readonly TipTopExpense[]
}

/**
 * One category-focused saving tip for the dashboard (pure domain, §5.11 upgraded).
 *
 * Closed months identify the largest saving opportunity for next month's budget.
 * The current month excludes categories that are already over budget and points
 * to one category where the remaining spend can still be controlled.
 */
export function buildSavingTipTemplates(input: SavingTipInput): string[] {
  const overBudget = input.achievements
    .filter((a) => a.type === 'expense' && a.status === '초과' && a.target > 0)
    .sort((a, b) => a.remaining - b.remaining) // most overspent first (most negative remaining)

  if (input.period === 'closed') {
    const worst = overBudget[0]
    if (worst) {
      return [
        `이번 달 가장 큰 절약 필요 항목은 ${worst.name}입니다. 예산을 ${won(Math.abs(worst.remaining))} 초과했으므로 다음 달 한도를 우선 재조정하세요.`,
      ]
    }

    const top = input.topExpenses?.find((row) => row.amount > 0)
    if (!top) return []
    return [
      `이번 달 가장 큰 절약 후보는 ${top.name}(${won(top.amount)}, 지출의 ${top.pct}%)입니다. 다음 달 예산을 짤 때 이 항목의 한도를 먼저 점검하세요.`,
    ]
  }

  const overBudgetNames = new Set(overBudget.map((row) => row.name))
  const adjustable = input.achievements
    .filter(
      (row) =>
        row.type === 'expense' &&
        row.target > 0 &&
        row.actual > 0 &&
        row.status !== '초과',
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === '주의' ? -1 : 1
      return b.pct - a.pct
    })
  const urgent = adjustable[0]

  if (urgent?.status === '주의') {
    return [
      `남은 기간 가장 먼저 절약할 항목은 ${urgent.name}입니다. 예산이 ${won(urgent.remaining)} 남았으므로 추가 지출을 이 범위 안에서 관리하세요.`,
    ]
  }

  const top = input.topExpenses?.find(
    (row) => row.amount > 0 && !overBudgetNames.has(row.name),
  )
  if (top) {
    return [
      `남은 기간 절약 우선 항목은 ${top.name}(${won(top.amount)}, 지출의 ${top.pct}%)입니다. 이미 쓴 금액보다 추가 지출을 줄이는 데 집중하세요.`,
    ]
  }

  if (!urgent) return []
  return [
    `남은 기간 절약 우선 항목은 ${urgent.name}입니다. 남은 예산 ${won(urgent.remaining)}을 넘지 않도록 추가 지출 한도를 유지하세요.`,
  ]
}
