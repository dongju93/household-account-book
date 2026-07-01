import { describe, expect, it } from 'vite-plus/test'

import {
  type BudgetPaceRow,
  budgetPaceRowsWithStatus,
  budgetPaceStatus,
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

describe('budgetPaceStatus', () => {
  // June 2026 has 30 days, so a 300,000 budget's even-split rate is 10,000/day.
  const row = (overrides: Partial<BudgetPaceRow>): BudgetPaceRow => ({
    categoryId: 'food',
    name: '식비',
    budget: 300_000,
    actual: 0,
    remainingBudget: 300_000,
    daysRemaining: 20,
    dailyAllowance: 15_000,
    ...overrides,
  })

  it('is 초과 once the remaining budget hits zero or below', () => {
    expect(budgetPaceStatus(row({ remainingBudget: 0, dailyAllowance: 0 }), JUN_2026)).toBe('초과')
    expect(budgetPaceStatus(row({ remainingBudget: -1, dailyAllowance: 0 }), JUN_2026)).toBe('초과')
  })

  it('is 주의 when the daily allowance drops below half the even-split rate', () => {
    // remaining 50,000 over 20 days = 2,500/day, under half of 10,000.
    expect(
      budgetPaceStatus(row({ remainingBudget: 50_000, dailyAllowance: 2_500 }), JUN_2026),
    ).toBe('주의')
  })

  it('is 정상 when the daily allowance stays at or above half the even-split rate', () => {
    // remaining 200,000 over 20 days = 10,000/day, at the even-split rate.
    expect(
      budgetPaceStatus(row({ remainingBudget: 200_000, dailyAllowance: 10_000 }), JUN_2026),
    ).toBe('정상')
  })
})

describe('budgetPaceRowsWithStatus', () => {
  it('sorts riskiest categories first', () => {
    const rows: BudgetPaceRow[] = [
      {
        categoryId: 'a',
        name: '정상카테고리',
        budget: 300_000,
        actual: 100_000,
        remainingBudget: 200_000,
        daysRemaining: 20,
        dailyAllowance: 10_000,
      },
      {
        categoryId: 'b',
        name: '초과카테고리',
        budget: 100_000,
        actual: 150_000,
        remainingBudget: -50_000,
        daysRemaining: 20,
        dailyAllowance: 0,
      },
      {
        categoryId: 'c',
        name: '주의카테고리',
        budget: 300_000,
        actual: 250_000,
        remainingBudget: 50_000,
        daysRemaining: 20,
        dailyAllowance: 2_500,
      },
    ]

    expect(budgetPaceRowsWithStatus(rows, JUN_2026).map((r) => [r.name, r.status])).toEqual([
      ['초과카테고리', '초과'],
      ['주의카테고리', '주의'],
      ['정상카테고리', '정상'],
    ])
  })
})
