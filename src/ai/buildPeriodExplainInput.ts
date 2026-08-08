/**
 * Reports aggregates → `PeriodExplainInput` pure builder (docs/4 §5.12, PR-9).
 * Whitelist-maps fields so raw transactions or internal ids cannot leak into
 * the Edge payload. Enforces limits mirroring `AI_LIMITS.periodExplain`.
 */

import type {
  CategoryBreakdownRow,
  CategoryDeltaRow,
  MonthlyTrendPoint,
  ReportPeriodMonths,
} from '../domain/reports'
import type { YearMonth } from '../lib/month'
import { dayOfMonthFromISO, daysInCalendarMonth } from '../lib/month'
import { AI_LIMITS, type PeriodExplainInput } from './types'

export function buildPeriodExplainInput(args: {
  period: ReportPeriodMonths
  trend: readonly MonthlyTrendPoint[]
  breakdown: readonly CategoryBreakdownRow[]
  categoryChanges: readonly CategoryDeltaRow[]
  inProgress?: { asOf: string; ym: YearMonth }
}): PeriodExplainInput {
  const { period, trend, breakdown, categoryChanges, inProgress } = args
  const caps = AI_LIMITS.periodExplain

  const slicedTrend = trend.slice(-caps.monthsMax)
  const firstMonth = slicedTrend[0]?.month ?? ''
  const lastMonth = slicedTrend[slicedTrend.length - 1]?.month ?? ''
  const periodKey = `${period}m:${firstMonth}_${lastMonth}`

  const input: PeriodExplainInput = {
    periodKey,
    months: slicedTrend.map((pt) => ({
      month: pt.month,
      income: pt.totalIncome,
      expense: pt.totalExpense,
      saving: pt.totalSaving,
      investment: pt.totalInvestment,
      balance: pt.balance,
    })),
    topCategories: breakdown.slice(0, caps.topCategoriesMax).map((r) => ({
      name: r.name,
      amount: r.amount,
      pct: r.pct,
    })),
    categoryChanges: categoryChanges
      .filter((r) => r.delta !== 0)
      .toSorted((a, b) => Math.abs(b.delta) - Math.abs(a.delta) || b.delta - a.delta)
      .slice(0, caps.categoryChangesMax)
      .map((r) => ({
        name: r.name,
        previousAmount: r.previousAmount,
        latestAmount: r.latestAmount,
        delta: r.delta,
        deltaPct: r.deltaPct,
      })),
  }

  if (inProgress) {
    const daysInMonth = daysInCalendarMonth(inProgress.ym.year, inProgress.ym.month)
    const day = dayOfMonthFromISO(inProgress.asOf)
    input.progress = {
      asOf: inProgress.asOf,
      dayOfMonth: Math.min(Math.max(day, 1), daysInMonth),
      daysInMonth,
    }
  }

  return input
}
