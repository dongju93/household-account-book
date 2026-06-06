import type { FundType } from './fundType'
import type {
  AchievementStatus,
  CategoryLike,
  ExpenseStatus,
  SavingStatus,
  TxnLike,
} from './types'

/**
 * Achievement percentage, guarded against divide-by-zero (spec §6.3).
 * A target of 0 (or unset) yields 0% rather than Infinity/NaN.
 */
export function pctOf(actual: number, target: number): number {
  if (target <= 0) return 0
  return Math.round((actual / target) * 100)
}

/** 지출: 초과 if over budget, 주의 if ≥90% of budget, else 정상. */
export function expenseStatus(actual: number, budget: number): ExpenseStatus {
  if (actual > budget) return '초과'
  // budget > 0 guard prevents a 0-budget/0-spend row from reading as 주의.
  if (budget > 0 && actual >= budget * 0.9) return '주의'
  return '정상'
}

/** 저축: 달성 if goal met, 근접 if ≥90% of goal, else 진행중. */
export function savingStatus(actual: number, goal: number): SavingStatus {
  if (goal > 0 && actual >= goal) return '달성'
  if (goal > 0 && actual >= goal * 0.9) return '근접'
  return '진행중'
}

export interface AchievementRow {
  categoryId: string
  name: string
  type: Extract<FundType, 'expense' | 'saving'>
  target: number // budget (지출) or goal (저축)
  actual: number
  remaining: number // target − actual
  pct: number
  status: AchievementStatus
}

/**
 * Build achievement rows for ONLY 지출 and 저축 categories (spec §6.3 excludes
 * 수입/투자). `actual` is summed from the month's transactions by category.
 */
export function computeAchievements(
  categories: readonly CategoryLike[],
  txns: readonly TxnLike[],
): AchievementRow[] {
  const actualByCat = new Map<string, number>()
  for (const t of txns) {
    actualByCat.set(t.categoryId, (actualByCat.get(t.categoryId) ?? 0) + t.amount)
  }

  const rows: AchievementRow[] = []
  for (const c of categories) {
    if (c.type === 'expense') {
      const target = c.budgetAmount ?? 0
      const actual = actualByCat.get(c.id) ?? 0
      rows.push({
        categoryId: c.id,
        name: c.name,
        type: 'expense',
        target,
        actual,
        remaining: target - actual,
        pct: pctOf(actual, target),
        status: expenseStatus(actual, target),
      })
    } else if (c.type === 'saving') {
      const target = c.goalAmount ?? 0
      const actual = actualByCat.get(c.id) ?? 0
      rows.push({
        categoryId: c.id,
        name: c.name,
        type: 'saving',
        target,
        actual,
        remaining: target - actual,
        pct: pctOf(actual, target),
        status: savingStatus(actual, target),
      })
    }
    // 수입 / 투자 categories are intentionally skipped.
  }
  return rows
}
