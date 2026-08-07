import type { FundType } from './fundType'

export const MIN_BUDGET_HISTORY_MONTHS = 3
export const BUDGET_BUFFER_PERCENT = 10
export const BUDGET_ROUNDING_UNIT = 10_000

export interface BudgetSuggestionTxn {
  categoryId: string
  type: FundType
  amount: number
  txnDate: string
}

export interface BudgetSuggestionCategory {
  id: string
  name: string
  type: FundType
  budgetAmount: number | null
  isActive: boolean
  createdAt: string
}

export interface CategoryBudgetSuggestion {
  categoryId: string
  categoryName: string
  currentAmount: number
  suggestedAmount: number
  difference: number
  medianAmount: number
  maxAmount: number
  observedMonths: number
  monthsWithSpend: number
}

function isMonthKey(value: string): boolean {
  return /^\d{4}-(0[1-9]|1[0-2])$/.test(value)
}

function calendarMonthKey(value: string, timeZone?: string): string | null {
  const instant = new Date(value)
  if (Number.isNaN(instant.getTime())) return null

  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: '2-digit',
    timeZone,
  }).formatToParts(instant)
  const year = parts.find((part) => part.type === 'year')?.value
  const month = parts.find((part) => part.type === 'month')?.value
  const key = year && month ? `${year}-${month}` : ''
  return isMonthKey(key) ? key : null
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function suggestedBudget(medianAmount: number): number {
  const buffered = (medianAmount * (100 + BUDGET_BUFFER_PERCENT)) / 100
  return Math.ceil(buffered / BUDGET_ROUNDING_UNIT) * BUDGET_ROUNDING_UNIT
}

/**
 * Suggests next-month expense budgets from complete historical months.
 *
 * The caller supplies the bounded month window. A category needs at least three
 * full months after its creation month and spend in at least three of them. The
 * proposal is the monthly-total median plus a 10% buffer, rounded up to ₩10,000.
 * Returning a proposal is read-only; the settings form remains the only write
 * boundary and must still be explicitly saved by the user.
 */
export function suggestCategoryBudgets(
  transactions: readonly BudgetSuggestionTxn[],
  categories: readonly BudgetSuggestionCategory[],
  monthKeys: readonly string[],
  calendarTimeZone?: string,
): CategoryBudgetSuggestion[] {
  const months = [...new Set(monthKeys.filter(isMonthKey))].sort()
  if (months.length < MIN_BUDGET_HISTORY_MONTHS) return []
  const monthSet = new Set(months)
  const totals = new Map<string, Map<string, number>>()

  for (const txn of transactions) {
    if (txn.type !== 'expense' || !Number.isSafeInteger(txn.amount) || txn.amount <= 0) continue
    const month = txn.txnDate.slice(0, 7)
    if (!monthSet.has(month)) continue
    let categoryTotals = totals.get(txn.categoryId)
    if (!categoryTotals) {
      categoryTotals = new Map()
      totals.set(txn.categoryId, categoryTotals)
    }
    categoryTotals.set(month, (categoryTotals.get(month) ?? 0) + txn.amount)
  }

  const suggestions: CategoryBudgetSuggestion[] = []

  for (const category of categories) {
    if (!category.isActive || category.type !== 'expense') continue
    const createdMonth = calendarMonthKey(category.createdAt, calendarTimeZone)
    // The creation month may be partial, so it is not evidence for a full-month budget.
    const observedMonthKeys = createdMonth ? months.filter((month) => month > createdMonth) : months
    if (observedMonthKeys.length < MIN_BUDGET_HISTORY_MONTHS) continue

    const categoryTotals = totals.get(category.id)
    const monthlyAmounts = observedMonthKeys.map((month) => categoryTotals?.get(month) ?? 0)
    const monthsWithSpend = monthlyAmounts.filter((amount) => amount > 0).length
    if (monthsWithSpend < MIN_BUDGET_HISTORY_MONTHS) continue

    const medianAmount = median(monthlyAmounts)
    if (medianAmount <= 0) continue
    const proposed = suggestedBudget(medianAmount)
    const current = category.budgetAmount ?? 0
    if (proposed === current) continue

    suggestions.push({
      categoryId: category.id,
      categoryName: category.name,
      currentAmount: current,
      suggestedAmount: proposed,
      difference: proposed - current,
      medianAmount,
      maxAmount: Math.max(...monthlyAmounts),
      observedMonths: observedMonthKeys.length,
      monthsWithSpend,
    })
  }

  return suggestions.sort((a, b) => {
    const relativeA = Math.abs(a.difference) / Math.max(a.currentAmount, 1)
    const relativeB = Math.abs(b.difference) / Math.max(b.currentAmount, 1)
    if (relativeA !== relativeB) return relativeB - relativeA
    return a.categoryName.localeCompare(b.categoryName, 'ko-KR')
  })
}
