import { describe, expect, it } from 'vite-plus/test'

import { groupTransactionsByMonth, monthTrendLabel } from './reports'
import { groupTransactionsByDate } from './transactionGroups'
import type { Transaction } from './types'

const txn = (over: Partial<Transaction> = {}): Transaction => ({
  id: '1',
  ledgerId: 'l1',
  categoryId: 'c1',
  txnDate: '2026-06-15',
  type: 'expense',
  amount: 1000,
  memo: null,
  source: 'manual',
  recurringId: null,
  occurrenceMonth: null,
  createdAt: '',
  updatedAt: '',
  ...over,
})

describe('groupTransactionsByDate', () => {
  it('groups rows by date and computes net', () => {
    const groups = groupTransactionsByDate([
      txn({ id: '1', txnDate: '2026-06-15', type: 'income', amount: 5000 }),
      txn({ id: '2', txnDate: '2026-06-15', amount: 1000 }),
      txn({ id: '3', txnDate: '2026-06-14', amount: 2000 }),
    ])
    expect(groups).toHaveLength(2)
    expect(groups[0]).toMatchObject({ date: '2026-06-15', net: 4000 })
    expect(groups[1]).toMatchObject({ date: '2026-06-14', net: -2000 })
  })
})

describe('groupTransactionsByMonth', () => {
  it('buckets transactions into requested months', () => {
    const byMonth = groupTransactionsByMonth(
      [
        { year: 2026, month: 5 },
        { year: 2026, month: 6 },
      ],
      [
        txn({ txnDate: '2026-05-10' }),
        txn({ id: '2', txnDate: '2026-06-01' }),
        txn({ id: '3', txnDate: '2026-06-20' }),
      ],
    )
    expect(byMonth.get('2026-05')).toHaveLength(1)
    expect(byMonth.get('2026-06')).toHaveLength(2)
    expect(byMonth.get('2026-04')).toBeUndefined()
  })
})

describe('monthTrendLabel', () => {
  it('formats YYYY-MM as short month label', () => {
    expect(monthTrendLabel('2026-06')).toBe('6월')
    expect(monthTrendLabel('2026-12')).toBe('12월')
  })
})
