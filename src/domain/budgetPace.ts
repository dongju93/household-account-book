import { won } from '../lib/format'
import type { YearMonth } from '../lib/month'
import { daysInCalendarMonth, dayOfMonthFromISO, monthKey, monthRange } from '../lib/month'
import type { CategoryLike, TxnLike } from './types'

export interface BudgetPaceRow {
  categoryId: string
  name: string
  budget: number
  actual: number
  remainingBudget: number
  /** Days left in the month including today. */
  daysRemaining: number
  /** Even daily spend to stay within budget; 0 when over budget. */
  dailyAllowance: number
}

/**
 * Reference date: today for the in-progress month, otherwise the month's last day.
 */
export function paceAsOfDate(ym: YearMonth, today: string): string {
  const { start, endExclusive } = monthRange(ym.year, ym.month)
  if (today >= start && today < endExclusive) return today
  const last = daysInCalendarMonth(ym.year, ym.month)
  return `${monthKey(ym.year, ym.month)}-${String(last).padStart(2, '0')}`
}

/**
 * Remaining budget spread evenly over the rest of the month (today included).
 */
export function computeDailyAllowance(
  actual: number,
  budget: number,
  ym: YearMonth,
  asOfDate: string,
): Pick<BudgetPaceRow, 'remainingBudget' | 'daysRemaining' | 'dailyAllowance'> | null {
  if (budget <= 0) return null

  const daysInMonth = daysInCalendarMonth(ym.year, ym.month)
  const dayOfMonth = dayOfMonthFromISO(asOfDate)
  if (dayOfMonth < 1 || dayOfMonth > daysInMonth) return null

  const daysRemaining = daysInMonth - dayOfMonth + 1
  const remainingBudget = budget - actual

  if (remainingBudget <= 0) {
    return { remainingBudget, daysRemaining, dailyAllowance: 0 }
  }

  return {
    remainingBudget,
    daysRemaining,
    dailyAllowance: Math.floor(remainingBudget / daysRemaining),
  }
}

/** One row per 지출 category that has a budget. */
export function computeBudgetPaceRows(
  categories: readonly CategoryLike[],
  txns: readonly TxnLike[],
  ym: YearMonth,
  asOfDate: string,
): BudgetPaceRow[] {
  const refDate = paceAsOfDate(ym, asOfDate)

  const actualByCat = new Map<string, number>()
  for (const t of txns) {
    if (t.type !== 'expense') continue
    actualByCat.set(t.categoryId, (actualByCat.get(t.categoryId) ?? 0) + t.amount)
  }

  const rows: BudgetPaceRow[] = []
  for (const c of categories) {
    if (c.type !== 'expense' || !c.showBudgetPace) continue
    const budget = c.budgetAmount ?? 0
    if (budget <= 0) continue

    const actual = actualByCat.get(c.id) ?? 0
    const pace = computeDailyAllowance(actual, budget, ym, refDate)
    if (!pace) continue

    rows.push({
      categoryId: c.id,
      name: c.name,
      budget,
      actual,
      ...pace,
    })
  }

  return rows
}

/** Build a categoryId → pace lookup for merging into 달성 확인 rows. */
export function paceByCategoryId(rows: readonly BudgetPaceRow[]): Map<string, BudgetPaceRow> {
  return new Map(rows.map((r) => [r.categoryId, r]))
}

/** Subline copy for an expense row opted-in via 설정. */
export function formatPaceHint(
  pace: Pick<BudgetPaceRow, 'daysRemaining' | 'dailyAllowance' | 'remainingBudget'>,
): string {
  const daily = pace.remainingBudget <= 0 ? 0 : pace.dailyAllowance
  return `남은 ${pace.daysRemaining}일 · 하루 ${won(daily)}`
}
