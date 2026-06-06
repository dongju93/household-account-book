import { computeMonthSummary, type MonthSummary } from './monthSummary'
import type { CategoryLike, TxnLike } from './types'

export interface MonthlyTrendPoint extends MonthSummary {
  month: string // 'YYYY-MM'
}

/**
 * Per-month summaries for the 통계 trend charts. Crucially this REUSES
 * computeMonthSummary so reports and the dashboard can never diverge (spec §8).
 */
export function monthlyTrend(txnsByMonth: ReadonlyMap<string, readonly TxnLike[]>): MonthlyTrendPoint[] {
  return [...txnsByMonth.keys()]
    .sort()
    .map((month) => ({ month, ...computeMonthSummary(txnsByMonth.get(month) ?? []) }))
}

export interface CategoryBreakdownRow {
  categoryId: string
  name: string
  amount: number
  pct: number // share of total expense, 0..100
}

/**
 * 카테고리별 지출 비교 — expense transactions grouped by category, each row's
 * share of total expense. Used by both the dashboard donut and the reports bar.
 */
export function categoryExpenseBreakdown(
  categories: readonly CategoryLike[],
  txns: readonly TxnLike[],
): CategoryBreakdownRow[] {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))
  const amountByCat = new Map<string, number>()
  let total = 0

  for (const t of txns) {
    if (t.type !== 'expense') continue
    amountByCat.set(t.categoryId, (amountByCat.get(t.categoryId) ?? 0) + t.amount)
    total += t.amount
  }

  const rows: CategoryBreakdownRow[] = []
  for (const [categoryId, amount] of amountByCat) {
    rows.push({
      categoryId,
      name: nameById.get(categoryId) ?? '기타',
      amount,
      pct: total > 0 ? Math.round((amount / total) * 100) : 0,
    })
  }
  return rows.sort((a, b) => b.amount - a.amount)
}
