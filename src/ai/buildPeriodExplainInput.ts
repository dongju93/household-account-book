/**
 * Reports aggregates → `PeriodExplainInput` pure builder (docs/4 §5.12, PR-9).
 * Whitelist-maps fields so raw transactions or internal ids cannot leak into
 * the Edge payload. Enforces limits mirroring `AI_LIMITS.periodExplain`.
 */

import type { CategoryBreakdownRow, MonthlyTrendPoint, ReportPeriodMonths } from '../domain/reports'
import { AI_LIMITS, type PeriodExplainInput } from './types'

export function buildPeriodExplainInput(args: {
  period: ReportPeriodMonths
  trend: readonly MonthlyTrendPoint[]
  breakdown: readonly CategoryBreakdownRow[]
}): PeriodExplainInput {
  const { period, trend, breakdown } = args
  const caps = AI_LIMITS.periodExplain

  const slicedTrend = trend.slice(-caps.monthsMax)
  const firstMonth = slicedTrend[0]?.month ?? ''
  const lastMonth = slicedTrend[slicedTrend.length - 1]?.month ?? ''
  const periodKey = `${period}m:${firstMonth}_${lastMonth}`

  return {
    periodKey,
    months: slicedTrend.map((pt) => ({
      month: pt.month,
      income: pt.totalIncome,
      expense: pt.totalExpense,
      saving: pt.totalSaving,
      investment: pt.totalInvestment,
      balance: pt.balance,
    })),
    topCategories: breakdown.slice(0, 5).map((r) => ({
      name: r.name,
      amount: r.amount,
      pct: r.pct,
    })),
  }
}
