import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { Category, Transaction } from '../../domain/types'

vi.mock('../../auth/useLedger', () => ({
  useLedger: () => ({ ledgerId: 'ledger', canEdit: true }),
}))
vi.mock('../../app/useRefresh', () => ({ useRefresh: () => ({ version: 0, refresh: vi.fn() }) }))
vi.mock('../../app/useMaterializedMonth', () => ({ useMaterializedMonth: () => async () => {} }))
vi.mock('../../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../../data/transactions', () => ({
  listTransactions: vi.fn(),
  listAllTransactions: vi.fn(),
  deleteTransaction: vi.fn(),
}))
vi.mock('./TransactionSheet', () => ({ TransactionSheet: () => null }))
vi.mock('./CsvImportSheet', () => ({ CsvImportSheet: () => null }))

import { listCategories } from '../../data/categories'
import { listTransactions } from '../../data/transactions'
import { TransactionsPage } from './TransactionsPage'

const category: Category = {
  id: 'old-category',
  ledgerId: 'ledger',
  name: '옛 식비',
  type: 'expense',
  icon: null,
  budgetAmount: null,
  goalAmount: null,
  sortOrder: 0,
  isActive: false,
  showBudgetPace: false,
  createdAt: '',
  updatedAt: '',
}
const txn: Transaction = {
  id: 'one',
  ledgerId: 'ledger',
  categoryId: category.id,
  txnDate: '2026-11-01',
  type: 'expense',
  amount: 10000,
  memo: '점심 기록',
  source: 'manual',
  recurringId: null,
  occurrenceMonth: null,
  createdAt: '',
  updatedAt: '',
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.mocked(listCategories).mockResolvedValue([category])
})

describe('transaction browsing recovery', () => {
  it('allows filtering by an inactive historical category', async () => {
    const user = userEvent.setup()
    vi.mocked(listTransactions).mockResolvedValue({ rows: [txn], nextCursor: null })
    render(<TransactionsPage />)
    await screen.findByRole('option', { name: '옛 식비 (비활성)' })
    await user.selectOptions(screen.getByLabelText('카테고리'), category.id)
    await waitFor(() =>
      expect(listTransactions).toHaveBeenLastCalledWith(
        'ledger',
        expect.objectContaining({ categoryId: category.id }),
        null,
      ),
    )
    expect(await screen.findByText(txn.memo!)).toBeInTheDocument()
  })

  it('keeps the visible transactions and retries the failed next page', async () => {
    const user = userEvent.setup()
    vi.mocked(listTransactions)
      .mockResolvedValueOnce({ rows: [txn], nextCursor: { date: txn.txnDate, id: txn.id } })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ rows: [{ ...txn, id: 'two', memo: '저녁 기록' }], nextCursor: null })
    render(<TransactionsPage />)
    await screen.findByText('점심 기록')
    await user.click(screen.getByRole('button', { name: '더 보기' }))
    await screen.findByRole('button', { name: '더 보기 다시 시도' })
    expect(screen.getByText('점심 기록')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: '더 보기 다시 시도' }))
    await screen.findByText('저녁 기록')
    expect(screen.getByText('점심 기록')).toBeInTheDocument()
  })
})
