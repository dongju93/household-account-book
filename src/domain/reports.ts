import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'
import { computeMonthSummary, type MonthSummary } from './monthSummary'
import type { CategoryLike, Transaction, TxnLike } from './types'

/** Selectable trend windows — shared by the 통계 screen chips and the qna_* tool schemas. */
export const REPORT_PERIODS = [3, 6, 12] as const

export type ReportPeriodMonths = (typeof REPORT_PERIODS)[number]

/** Short month label for chart axes, e.g. "06월". */
export function monthTrendLabel(month: string): string {
  return `${Number(month.slice(5, 7))}월`
}

/** Bucket transactions into month keys for trend/stack aggregations. */
export function groupTransactionsByMonth(
  months: readonly YearMonth[],
  txns: readonly Transaction[],
): Map<string, Transaction[]> {
  const byMonth = new Map<string, Transaction[]>()
  for (const m of months) byMonth.set(monthKey(m.year, m.month), [])
  for (const t of txns) byMonth.get(t.txnDate.slice(0, 7))?.push(t)
  return byMonth
}

export interface MonthlyTrendPoint extends MonthSummary {
  month: string // 'YYYY-MM'
}

/**
 * Per-month summaries for the 통계 trend charts. Crucially this REUSES
 * computeMonthSummary so reports and the dashboard can never diverge (spec §8).
 */
export function monthlyTrend(
  txnsByMonth: ReadonlyMap<string, readonly TxnLike[]>,
): MonthlyTrendPoint[] {
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

export interface CategoryDeltaRow {
  categoryId: string
  name: string
  latestAmount: number
  previousAmount: number
  delta: number // latestAmount - previousAmount
  deltaPct: number // vs previousAmount; a category appearing from 0 reads as +100
}

/**
 * 카테고리별 지출 증감 — compares the LAST TWO months of the window by
 * recombining categoryExpenseBreakdown per month and joining on category id,
 * sorted by biggest increase first. Divide-by-zero follows the pctOf guard
 * (achievement.ts): previousAmount 0 yields ±100/0, never Infinity/NaN.
 */
export function categoryMonthOverMonthDeltas(
  categories: readonly CategoryLike[],
  txnsByMonth: ReadonlyMap<string, readonly TxnLike[]>,
): CategoryDeltaRow[] {
  const months = [...txnsByMonth.keys()].sort()
  if (months.length === 0) return []

  const latest = categoryExpenseBreakdown(categories, txnsByMonth.get(months.at(-1)!) ?? [])
  const previous =
    months.length > 1
      ? categoryExpenseBreakdown(categories, txnsByMonth.get(months.at(-2)!) ?? [])
      : []
  const previousByCat = new Map(previous.map((r) => [r.categoryId, r.amount]))

  const rows: CategoryDeltaRow[] = latest.map((r) => {
    const previousAmount = previousByCat.get(r.categoryId) ?? 0
    const delta = r.amount - previousAmount
    return {
      categoryId: r.categoryId,
      name: r.name,
      latestAmount: r.amount,
      previousAmount,
      delta,
      deltaPct:
        previousAmount > 0 ? Math.round((delta / previousAmount) * 100) : r.amount > 0 ? 100 : 0,
    }
  })

  // Categories with spend last month but none this month still matter to the
  // "what changed" question — surface them as full decreases.
  const latestIds = new Set(latest.map((r) => r.categoryId))
  for (const r of previous) {
    if (latestIds.has(r.categoryId)) continue
    rows.push({
      categoryId: r.categoryId,
      name: r.name,
      latestAmount: 0,
      previousAmount: r.amount,
      delta: -r.amount,
      deltaPct: -100,
    })
  }

  return rows.sort((a, b) => b.delta - a.delta)
}

export interface CategoryStackSeries {
  key: string
  name: string
}

export interface MonthlyCategoryStackPoint {
  month: string
  label: string
  /** Dynamic keys per category name (or "기타") map to expense amounts. */
  [segment: string]: string | number
}

/**
 * Top-N expense categories per month, remainder rolled into "기타".
 * Powers the stacked bar chart on the 통계 screen.
 */
export function monthlyCategoryStacks(
  categories: readonly CategoryLike[],
  txnsByMonth: ReadonlyMap<string, readonly TxnLike[]>,
  topN = 4,
): { points: MonthlyCategoryStackPoint[]; series: CategoryStackSeries[] } {
  const nameById = new Map(categories.map((c) => [c.id, c.name]))
  const globalTotals = new Map<string, number>()

  for (const txns of txnsByMonth.values()) {
    for (const t of txns) {
      if (t.type !== 'expense') continue
      globalTotals.set(t.categoryId, (globalTotals.get(t.categoryId) ?? 0) + t.amount)
    }
  }

  const topIds = [...globalTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([id]) => id)

  const series: CategoryStackSeries[] = topIds.map((id) => {
    const name = nameById.get(id) ?? '기타'
    return { key: name, name }
  })
  const hasOther = globalTotals.size > topIds.length
  if (hasOther) series.push({ key: '기타', name: '기타' })

  const topIdSet = new Set(topIds)
  const points: MonthlyCategoryStackPoint[] = [...txnsByMonth.keys()].sort().map((month) => {
    const point: MonthlyCategoryStackPoint = {
      month,
      label: monthTrendLabel(month),
    }
    let other = 0
    for (const t of txnsByMonth.get(month) ?? []) {
      if (t.type !== 'expense') continue
      const name = nameById.get(t.categoryId) ?? '기타'
      if (topIdSet.has(t.categoryId)) {
        point[name] = (Number(point[name]) || 0) + t.amount
      } else {
        other += t.amount
      }
    }
    if (hasOther && other > 0) point['기타'] = other
    for (const s of series) {
      if (point[s.key] == null) point[s.key] = 0
    }
    return point
  })

  return { points, series }
}
