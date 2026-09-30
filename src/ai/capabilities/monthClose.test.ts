import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON } from '../../domain/monthClose'
import type { Category, RecurringItem, Transaction } from '../../domain/types'
import { monthKey, type YearMonth } from '../../lib/month'

vi.mock('../../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../../data/recurring', () => ({
  listRecurring: vi.fn(),
  listSkippedRecurringIds: vi.fn(),
}))
vi.mock('../../data/summary', () => ({
  materializeMonth: vi.fn(),
  fetchTransactionsInRange: vi.fn(),
}))

import { listCategories } from '../../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../../data/recurring'
import { fetchTransactionsInRange, materializeMonth } from '../../data/summary'
import { loadMonthCloseReview } from './monthClose'

const mockedListCategories = vi.mocked(listCategories)
const mockedListRecurring = vi.mocked(listRecurring)
const mockedListSkipped = vi.mocked(listSkippedRecurringIds)
const mockedFetchTxns = vi.mocked(fetchTransactionsInRange)
const mockedMaterializeMonth = vi.mocked(materializeMonth)

const YM: YearMonth = { year: 2026, month: 6 }
const YM_KEY = monthKey(YM.year, YM.month)

const CATEGORIES: Category[] = [
  {
    id: 'food',
    ledgerId: 'ledger-1',
    name: '식비',
    type: 'expense',
    icon: null,
    budgetAmount: 100_000,
    goalAmount: null,
    sortOrder: 0,
    isActive: true,
    showBudgetPace: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'old',
    ledgerId: 'ledger-1',
    name: '보관 카테고리',
    type: 'expense',
    icon: null,
    budgetAmount: 50_000,
    goalAmount: null,
    sortOrder: 1,
    isActive: false,
    showBudgetPace: false,
    createdAt: '',
    updatedAt: '',
  },
]

const TXN: Transaction = {
  id: 't1',
  ledgerId: 'ledger-1',
  categoryId: 'food',
  txnDate: `${YM_KEY}-05`,
  type: 'expense',
  amount: 150_000,
  memo: null,
  source: 'manual',
  recurringId: null,
  occurrenceMonth: null,
  createdAt: '',
  updatedAt: '',
}

const OCCURRENCE: Transaction = {
  ...TXN,
  id: 't-rec',
  txnDate: `${YM_KEY}-01`,
  amount: 500_000,
  source: 'recurring',
  recurringId: 'r1',
  occurrenceMonth: `${YM_KEY}-01`,
}

const RECURRING: RecurringItem[] = [
  {
    id: 'r1',
    ledgerId: 'ledger-1',
    categoryId: 'food',
    name: '월세',
    type: 'expense',
    amount: 500_000,
    startMonth: '2020-01-01',
    endMonth: null,
    dayOfMonth: 1,
    isActive: true,
    memo: null,
    createdAt: '',
    updatedAt: '',
  },
]

beforeEach(() => {
  vi.clearAllMocks()
  mockedListCategories.mockResolvedValue(CATEGORIES)
  mockedListRecurring.mockResolvedValue(RECURRING)
  mockedListSkipped.mockResolvedValue(new Set())
  mockedFetchTxns.mockResolvedValue([TXN])
  mockedMaterializeMonth.mockResolvedValue(undefined)
})

describe('loadMonthCloseReview (shared capability, S14 / PR-14)', () => {
  it('materializes before any read, so findings can never under-count', async () => {
    let resolveMaterialize!: () => void
    mockedMaterializeMonth.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMaterialize = resolve
      }),
    )

    const pending = loadMonthCloseReview('ledger-1', YM, { canEdit: true })
    await Promise.resolve()
    expect(mockedMaterializeMonth).toHaveBeenCalledWith('ledger-1', YM)
    expect(mockedFetchTxns).not.toHaveBeenCalled()
    expect(mockedListRecurring).not.toHaveBeenCalled()

    resolveMaterialize()
    await pending
    expect(mockedFetchTxns).toHaveBeenCalledTimes(1)
  })

  it('returns a ready review with counts based on ACTIVE categories only', async () => {
    const result = await loadMonthCloseReview('ledger-1', YM, { canEdit: true })

    if (!result.ready) throw new Error('expected ready')
    expect(result.review.month).toBe(YM_KEY)
    expect(result.review.noIssueSummary).toEqual({ categoriesChecked: 1, transactionsChecked: 1 })
    expect(result.review.needsCheck.map((f) => f.kind)).toEqual(
      expect.arrayContaining(['over_budget', 'missing_recurring']),
    )
  })

  it('drops recurring items covered by a recurring_skips row for the month', async () => {
    mockedListSkipped.mockResolvedValue(new Set(['r1']))

    const result = await loadMonthCloseReview('ledger-1', YM, { canEdit: true })

    if (!result.ready) throw new Error('expected ready')
    expect(result.review.needsCheck.map((f) => f.kind)).not.toContain('missing_recurring')
  })

  it('returns ready:false (not a review) for viewers when occurrences are still missing', async () => {
    const result = await loadMonthCloseReview('ledger-1', YM, { canEdit: false })

    expect(result).toEqual({ ready: false, reason: MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON })
  })

  it('does not apply the viewer gate to editors with the same missing occurrence', async () => {
    const result = await loadMonthCloseReview('ledger-1', YM, { canEdit: true })

    expect(result.ready).toBe(true)
  })

  it('allows viewers once every eligible occurrence is already materialized', async () => {
    mockedFetchTxns.mockResolvedValue([TXN, OCCURRENCE])

    const result = await loadMonthCloseReview('ledger-1', YM, { canEdit: false })

    if (!result.ready) throw new Error('expected ready')
    expect(result.review.needsCheck.map((f) => f.kind)).not.toContain('missing_recurring')
  })

  it('does not let a skip hide the viewer gate for a different item', async () => {
    mockedListRecurring.mockResolvedValue([
      ...RECURRING,
      { ...RECURRING[0], id: 'r2', name: '통신비' },
    ])
    mockedListSkipped.mockResolvedValue(new Set(['r1']))
    mockedFetchTxns.mockResolvedValue([TXN])

    const result = await loadMonthCloseReview('ledger-1', YM, { canEdit: false })

    expect(result).toEqual({ ready: false, reason: MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON })
  })
})
