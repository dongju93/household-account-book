/**
 * Dashboard aggregates → `MonthInsightInput` pure builder (docs/4 §4.4, §5.3, PR-6).
 * Whitelist-maps every field so raw transactions (or ids) can never leak into
 * the Edge payload; caps mirror `AI_LIMITS.monthInsight` before the gateway
 * re-enforces them.
 */

import type { AchievementRow } from '../domain/achievement'
import type { BudgetPaceRowWithStatus } from '../domain/budgetPace'
import type { MonthSummary } from '../domain/monthSummary'
import type { CategoryBreakdownRow } from '../domain/reports'
import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'
import { AI_LIMITS, type MonthInsightInput } from './types'

export function buildMonthInsightInput(args: {
  ym: YearMonth
  summary: MonthSummary
  achievements: readonly AchievementRow[]
  /** Pass only for the in-progress month (pace is meaningless afterwards). */
  paceRows?: readonly BudgetPaceRowWithStatus[]
  /** Sorted desc by `categoryExpenseBreakdown`; top 5 are sent. */
  breakdown: readonly CategoryBreakdownRow[]
}): MonthInsightInput {
  const { ym, summary, achievements, paceRows, breakdown } = args
  const caps = AI_LIMITS.monthInsight
  const totalExpenseBudget = achievements
    .filter((a) => a.type === 'expense')
    .reduce((sum, a) => sum + a.target, 0)

  const input: MonthInsightInput = {
    month: monthKey(ym.year, ym.month),
    summary: {
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
      totalSaving: summary.totalSaving,
      totalInvestment: summary.totalInvestment,
      balance: summary.balance,
    },
    achievements: achievements.slice(0, caps.achievementsMax).map((a) => ({
      name: a.name,
      type: a.type,
      target: a.target,
      actual: a.actual,
      status: a.status,
      plannedExpenseSharePct:
        a.type === 'expense' && totalExpenseBudget > 0
          ? Math.round((a.target / totalExpenseBudget) * 100)
          : null,
      actualExpenseSharePct:
        a.type === 'expense' && summary.totalExpense > 0
          ? Math.round((a.actual / summary.totalExpense) * 100)
          : null,
    })),
    topExpenses: breakdown.slice(0, caps.topExpensesMax).map((r) => ({
      name: r.name,
      amount: r.amount,
      pct: r.pct,
    })),
  }

  if (paceRows) {
    input.pace = paceRows.slice(0, caps.paceMax).map((p) => ({
      name: p.name,
      remainingBudget: p.remainingBudget,
      daysRemaining: p.daysRemaining,
      dailyAllowance: p.dailyAllowance,
      status: p.status,
    }))
  }

  return input
}
