import { describe, expect, it } from 'vite-plus/test'

import { buildTxnExportRows, txnExportFilename } from './exportTransactions'
import type { Transaction } from './types'

const txn = (overrides: Partial<Transaction> = {}): Transaction => ({
  id: '1',
  ledgerId: 'ledger',
  categoryId: 'food',
  txnDate: '2026-06-15',
  type: 'expense',
  amount: 12_000,
  memo: '점심',
  source: 'manual',
  recurringId: null,
  occurrenceMonth: null,
  createdAt: '2026-06-15T00:00:00Z',
  updatedAt: '2026-06-15T00:00:00Z',
  ...overrides,
})

describe('buildTxnExportRows', () => {
  it('maps fields with Korean labels and category names', () => {
    const names = new Map([['food', '식비']])
    const [row] = buildTxnExportRows([txn()], names)
    expect(row).toEqual({
      날짜: '2026-06-15',
      구분: '지출',
      카테고리: '식비',
      '금액(원)': 12_000,
      메모: '점심',
      출처: '직접입력',
    })
  })

  it('uses fallback category name and empty memo', () => {
    const [row] = buildTxnExportRows([txn({ categoryId: 'missing', memo: null })], new Map())
    expect(row.카테고리).toBe('카테고리')
    expect(row.메모).toBe('')
  })

  it('labels recurring source as 고정항목', () => {
    const [row] = buildTxnExportRows(
      [
        txn({
          source: 'recurring',
          recurringId: 'rec-1',
          occurrenceMonth: '2026-06-01',
        }),
      ],
      new Map([['food', '식비']]),
    )
    expect(row.출처).toBe('고정항목')
  })
})

describe('txnExportFilename', () => {
  it('uses YYYY-MM in the filename', () => {
    expect(txnExportFilename({ year: 2026, month: 6 })).toBe('거래내역_2026-06.xlsx')
  })
})
