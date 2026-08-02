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
import { dayOfMonthFromISO, daysInCalendarMonth, monthKey } from '../lib/month'
import { AI_LIMITS, type MonthInsightInput } from './types'

export function buildMonthInsightInput(args: {
  ym: YearMonth
  summary: MonthSummary
  achievements: readonly AchievementRow[]
  /**
   * Pass only for the in-progress month. Bundling `asOf` with `paceRows` keeps the
   * payload from ever carrying pace without elapsed time (or the reverse): both
   * describe "the month isn't over", and a reader that sees one but not the other
   * would misread month-to-date figures as final.
   */
  inProgress?: { asOf: string; paceRows: readonly BudgetPaceRowWithStatus[] }
  /** Sorted desc by `categoryExpenseBreakdown`; top 5 are sent. */
  breakdown: readonly CategoryBreakdownRow[]
}): MonthInsightInput {
  const { ym, summary, achievements, inProgress, breakdown } = args
  const caps = AI_LIMITS.monthInsight

  const input: MonthInsightInput = {
    month: monthKey(ym.year, ym.month),
    summary: {
      totalIncome: summary.totalIncome,
      totalExpense: summary.totalExpense,
      totalSaving: summary.totalSaving,
      totalInvestment: summary.totalInvestment,
      balance: summary.balance,
    },
    totalExpenseBudget: achievements
      .filter((a) => a.type === 'expense')
      .reduce((sum, a) => sum + a.target, 0),
    achievements: achievements.slice(0, caps.achievementsMax).map((a) => ({
      name: a.name,
      type: a.type,
      target: a.target,
      actual: a.actual,
      status: a.status,
    })),
    topExpenses: breakdown.slice(0, caps.topExpensesMax).map((r) => ({
      name: r.name,
      amount: r.amount,
      pct: r.pct,
    })),
  }

  if (inProgress) {
    const daysInMonth = daysInCalendarMonth(ym.year, ym.month)
    const day = dayOfMonthFromISO(inProgress.asOf)
    input.progress = {
      asOf: inProgress.asOf,
      dayOfMonth: Math.min(Math.max(day, 1), daysInMonth),
      daysInMonth,
    }
    input.pace = inProgress.paceRows.slice(0, caps.paceMax).map((p) => ({
      name: p.name,
      remainingBudget: p.remainingBudget,
      daysRemaining: p.daysRemaining,
      dailyAllowance: p.dailyAllowance,
      status: p.status,
    }))
  }

  return input
}
