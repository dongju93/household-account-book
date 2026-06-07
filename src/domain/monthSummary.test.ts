import { describe, expect, it } from 'vite-plus/test'

import { computeMonthSummary } from './monthSummary'
import type { TxnLike } from './types'

const t = (type: TxnLike['type'], amount: number, categoryId = 'c'): TxnLike => ({
  type,
  amount,
  categoryId,
})

describe('computeMonthSummary', () => {
  it('returns zeros and zero balance for no transactions', () => {
    expect(computeMonthSummary([])).toEqual({
      totalIncome: 0,
      totalExpense: 0,
      totalSaving: 0,
      totalInvestment: 0,
      balance: 0,
    })
  })

  it('sums each fund type independently', () => {
    const txns = [
      t('income', 3_200_000),
      t('expense', 1_860_000),
      t('saving', 600_000),
      t('investment', 100_000),
    ]
    const s = computeMonthSummary(txns)
    expect(s.totalIncome).toBe(3_200_000)
    expect(s.totalExpense).toBe(1_860_000)
    expect(s.totalSaving).toBe(600_000)
    expect(s.totalInvestment).toBe(100_000)
  })

  it('computes balance as 수입 − 지출 − 저축 − 투자', () => {
    const txns = [
      t('income', 3_200_000),
      t('expense', 1_860_000),
      t('saving', 600_000),
      t('investment', 100_000),
    ]
    expect(computeMonthSummary(txns).balance).toBe(640_000)
  })

  it('aggregates multiple transactions of the same type', () => {
    const s = computeMonthSummary([t('expense', 4_500), t('expense', 9_000), t('expense', 29_000)])
    expect(s.totalExpense).toBe(42_500)
    expect(s.balance).toBe(-42_500)
  })

  it('counts materialized recurring rows like any other transaction', () => {
    // recurring rows are plain transactions by the time they reach the calc layer
    const s = computeMonthSummary([t('income', 3_200_000), t('saving', 100_000)])
    expect(s.totalIncome).toBe(3_200_000)
    expect(s.totalSaving).toBe(100_000)
    expect(s.balance).toBe(3_100_000)
  })
})
