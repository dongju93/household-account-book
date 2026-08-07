import { describe, expect, it } from 'vite-plus/test'

import type { FundType } from './fundType'
import {
  MAX_RECURRING_AMOUNT_VARIANCE_RATIO,
  MAX_RECURRING_DAY_SPREAD,
  suggestRecurringItems,
  type RecurringSuggestionTxn,
} from './recurringSuggestions'

const categories = [
  { id: 'housing', name: '주거', type: 'expense' as FundType, isActive: true },
  { id: 'inactive', name: '중단', type: 'expense' as FundType, isActive: false },
]

function txn(
  txnDate: string,
  amount: number,
  memo: string | null = '월세',
  overrides: Partial<RecurringSuggestionTxn> = {},
): RecurringSuggestionTxn {
  return {
    categoryId: 'housing',
    type: 'expense',
    amount,
    txnDate,
    memo,
    source: 'manual',
    ...overrides,
  }
}

describe('suggestRecurringItems', () => {
  it('returns a form-ready median draft for a conservative 3+ month pattern', () => {
    const result = suggestRecurringItems(
      [txn('2026-01-09', 500_000), txn('2026-02-10', 510_000), txn('2026-03-11', 505_000)],
      categories,
    )

    expect(result).toEqual([
      {
        categoryId: 'housing',
        categoryName: '주거',
        type: 'expense',
        name: '월세',
        amount: 505_000,
        dayOfMonth: 10,
        memo: '월세',
        months: ['2026-01', '2026-02', '2026-03'],
        amountMin: 500_000,
        amountMax: 510_000,
        dayMin: 9,
        dayMax: 11,
      },
    ])
  })

  it('rejects two-month, wide-amount, and wide-day patterns', () => {
    expect(
      suggestRecurringItems([txn('2026-01-10', 100_000), txn('2026-02-10', 100_000)], categories),
    ).toEqual([])

    const overAmountLimit = Math.floor(100_000 / (1 - MAX_RECURRING_AMOUNT_VARIANCE_RATIO)) + 1
    expect(
      suggestRecurringItems(
        [
          txn('2026-01-10', 100_000),
          txn('2026-02-10', 100_000),
          txn('2026-03-10', overAmountLimit),
        ],
        categories,
      ),
    ).toEqual([])

    expect(
      suggestRecurringItems(
        [
          txn('2026-01-10', 100_000),
          txn(`2026-02-${String(10 + MAX_RECURRING_DAY_SPREAD).padStart(2, '0')}`, 100_000),
          txn('2026-03-14', 100_000),
        ],
        categories,
      ),
    ).toEqual([])
  })

  it('keeps different memos separate and ignores recurring or inactive-category rows', () => {
    const rows = [
      txn('2026-01-10', 100_000, '월세'),
      txn('2026-02-10', 100_000, '관리비'),
      txn('2026-03-10', 100_000, '월세'),
      txn('2026-04-10', 100_000, '월세', { source: 'recurring' }),
      txn('2026-04-10', 100_000, '월세', { categoryId: 'inactive' }),
    ]
    expect(suggestRecurringItems(rows, categories)).toEqual([])
  })

  it('removes a suggestion already represented by a recurring item', () => {
    const rows = [txn('2026-01-09', 100_000), txn('2026-02-10', 101_000), txn('2026-03-11', 99_000)]
    expect(
      suggestRecurringItems(rows, categories, [
        { categoryId: 'housing', amount: 100_000, dayOfMonth: 10 },
      ]),
    ).toEqual([])
  })
})
