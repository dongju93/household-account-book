import { describe, expect, it } from 'vite-plus/test'

import {
  computeBudgetPaceRows,
  computeDailyAllowance,
  formatPaceHint,
  paceAsOfDate,
} from './budgetPace'
import type { CategoryLike, TxnLike } from './types'

const JUN_2026 = { year: 2026, month: 6 } as const

describe('computeDailyAllowance', () => {
  it('spreads remaining budget over days left including today', () => {
    const pace = computeDailyAllowance(150_000, 300_000, JUN_2026, '2026-06-10')!
    expect(pace.daysRemaining).toBe(21)
    expect(pace.remainingBudget).toBe(150_000)
    expect(pace.dailyAllowance).toBe(7_142)
  })

  it('returns 0 daily allowance when over budget', () => {
    const pace = computeDailyAllowance(310_000, 300_000, JUN_2026, '2026-06-10')!
    expect(pace.remainingBudget).toBe(-10_000)
    expect(pace.dailyAllowance).toBe(0)
  })
})

describe('formatPaceHint', () => {
  it('formats remaining days and daily allowance', () => {
    expect(
      formatPaceHint({ daysRemaining: 21, dailyAllowance: 7_142, remainingBudget: 150_000 }),
    ).toBe('남은 21일 · 하루 ₩7,142')
  })

  it('shows 하루 ₩0 when over budget', () => {
    expect(formatPaceHint({ daysRemaining: 21, dailyAllowance: 0, remainingBudget: -10_000 })).toBe(
      '남은 21일 · 하루 ₩0',
    )
  })
})

describe('paceAsOfDate', () => {
  it('uses today for the in-progress month', () => {
    expect(paceAsOfDate(JUN_2026, '2026-06-15')).toBe('2026-06-15')
  })
})

describe('computeBudgetPaceRows', () => {
  const cats: CategoryLike[] = [
    {
      id: 'food',
      name: '식비',
      type: 'expense',
      budgetAmount: 300_000,
      goalAmount: null,
      showBudgetPace: true,
    },
    {
      id: 'bus',
      name: '교통',
      type: 'expense',
      budgetAmount: 200_000,
      goalAmount: null,
      showBudgetPace: false,
    },
  ]

  const txns = (...pairs: [string, number][]): TxnLike[] =>
    pairs.map(([categoryId, amount]) => ({ type: 'expense', amount, categoryId }))

  it('includes only categories with showBudgetPace enabled', () => {
    const rows = computeBudgetPaceRows(cats, txns(['food', 80_000]), JUN_2026, '2026-06-10')
    expect(rows.map((r) => r.name)).toEqual(['식비'])
  })
})
