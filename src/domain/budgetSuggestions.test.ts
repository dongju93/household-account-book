import { describe, expect, it } from 'vite-plus/test'

import {
  suggestCategoryBudgets,
  type BudgetSuggestionCategory,
  type BudgetSuggestionTxn,
} from './budgetSuggestions'

const MONTHS = ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06']

function category(overrides: Partial<BudgetSuggestionCategory> = {}): BudgetSuggestionCategory {
  return {
    id: 'food',
    name: '식비',
    type: 'expense',
    budgetAmount: 100_000,
    isActive: true,
    createdAt: '2025-01-01T00:00:00Z',
    ...overrides,
  }
}

function txn(
  month: string,
  amount: number,
  overrides: Partial<BudgetSuggestionTxn> = {},
): BudgetSuggestionTxn {
  return {
    categoryId: 'food',
    type: 'expense',
    amount,
    txnDate: `${month}-10`,
    ...overrides,
  }
}

describe('suggestCategoryBudgets', () => {
  it('sums by month and proposes median + 10%, rounded up to ₩10,000', () => {
    const rows = [
      txn('2026-01', 40_000),
      txn('2026-01', 60_000),
      txn('2026-02', 120_000),
      txn('2026-03', 110_000),
      txn('2026-04', 100_000),
      txn('2026-05', 130_000),
      txn('2026-06', 90_000),
    ]

    expect(suggestCategoryBudgets(rows, [category()], MONTHS)).toEqual([
      {
        categoryId: 'food',
        categoryName: '식비',
        currentAmount: 100_000,
        suggestedAmount: 120_000,
        difference: 20_000,
        medianAmount: 105_000,
        maxAmount: 130_000,
        observedMonths: 6,
        monthsWithSpend: 6,
      },
    ])
  })

  it('includes zero-spend months in the monthly median after requiring three spend months', () => {
    const rows = [txn('2026-01', 100_000), txn('2026-03', 100_000), txn('2026-05', 100_000)]
    expect(
      suggestCategoryBudgets(rows, [category({ budgetAmount: null })], MONTHS)[0],
    ).toMatchObject({
      currentAmount: 0,
      suggestedAmount: 60_000,
      medianAmount: 50_000,
      monthsWithSpend: 3,
    })
  })

  it('rejects short histories, partial creation months, and non-expense categories', () => {
    const rows = [txn('2026-04', 100_000), txn('2026-05', 100_000), txn('2026-06', 100_000)]
    expect(suggestCategoryBudgets(rows, [category()], MONTHS.slice(4))).toEqual([])
    expect(
      suggestCategoryBudgets(rows, [category({ createdAt: '2026-04-15T00:00:00Z' })], MONTHS),
    ).toEqual([])
    expect(suggestCategoryBudgets(rows, [category({ type: 'saving' })], MONTHS)).toEqual([])
  })

  it('returns no action when the current budget already equals the proposal', () => {
    const rows = [txn('2026-01', 100_000), txn('2026-02', 100_000), txn('2026-03', 100_000)]
    expect(suggestCategoryBudgets(rows, [category({ budgetAmount: 60_000 })], MONTHS)).toEqual([])
  })
})
