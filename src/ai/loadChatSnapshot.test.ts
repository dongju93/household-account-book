import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { Category, RecurringItem, Transaction } from '../domain/types'
import { lastMonths, monthKey } from '../lib/month'

vi.mock('../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../data/recurring', () => ({ listRecurring: vi.fn(), listSkippedRecurringIds: vi.fn() }))
vi.mock('../data/summary', () => ({
  materializeMonths: vi.fn(),
  fetchTransactionsInRange: vi.fn(),
}))

import { listCategories } from '../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../data/recurring'
import { fetchTransactionsInRange, materializeMonths } from '../data/summary'
import { CHAT_SNAPSHOT_MATERIALIZE_INCOMPLETE_REASON, loadChatSnapshot } from './loadChatSnapshot'

const mockedListCategories = vi.mocked(listCategories)
const mockedListRecurring = vi.mocked(listRecurring)
const mockedListSkipped = vi.mocked(listSkippedRecurringIds)
const mockedFetchTxns = vi.mocked(fetchTransactionsInRange)
const mockedMaterializeMonths = vi.mocked(materializeMonths)

// Pin "now" so the 3-month window is deterministic: 2026-07, 2026-08, 2026-09.
const NOW = new Date('2026-09-19T12:00:00+09:00')
const WINDOW = lastMonths({ year: 2026, month: 9 }, 3)
const WINDOW_KEYS = WINDOW.map((ym) => monthKey(ym.year, ym.month))

const CATEGORIES: Category[] = [
  {
    id: 'housing',
    ledgerId: 'ledger-1',
    name: '주거',
    type: 'expense',
    icon: null,
    budgetAmount: 600_000,
    goalAmount: null,
    sortOrder: 0,
    isActive: true,
    showBudgetPace: false,
    createdAt: '',
    updatedAt: '',
  },
]

const RENT: RecurringItem = {
  id: 'r1',
  ledgerId: 'ledger-1',
  categoryId: 'housing',
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
}

/** A materialized occurrence of `RENT` for the given 'YYYY-MM'. */
function rentOccurrence(month: string): Transaction {
  return {
    id: `t-${month}`,
    ledgerId: 'ledger-1',
    categoryId: 'housing',
    txnDate: `${month}-01`,
    type: 'expense',
    amount: RENT.amount,
    memo: null,
    source: 'recurring',
    recurringId: RENT.id,
    occurrenceMonth: `${month}-01`,
    createdAt: '',
    updatedAt: '',
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(NOW)
  vi.clearAllMocks()
  mockedMaterializeMonths.mockResolvedValue(undefined)
  mockedListCategories.mockResolvedValue(CATEGORIES)
  mockedListRecurring.mockResolvedValue([RENT])
  mockedListSkipped.mockResolvedValue(new Set())
  mockedFetchTxns.mockResolvedValue(WINDOW_KEYS.map(rentOccurrence))
})

afterEach(() => {
  vi.useRealTimers()
})

describe('loadChatSnapshot viewer readiness (fail closed)', () => {
  it('materializes the whole window before reading', async () => {
    await loadChatSnapshot('ledger-1', { canEdit: true })

    expect(mockedMaterializeMonths).toHaveBeenCalledWith('ledger-1', WINDOW)
    expect(mockedMaterializeMonths.mock.invocationCallOrder[0]).toBeLessThan(
      mockedFetchTxns.mock.invocationCallOrder[0],
    )
  })

  it('throws for viewers when any month in the window still lacks a recurring occurrence', async () => {
    // Only the two oldest months were opened by an editor; the current one was
    // not, so materializeMonths resolved without inserting anything for it.
    mockedFetchTxns.mockResolvedValue(WINDOW_KEYS.slice(0, 2).map(rentOccurrence))

    await expect(loadChatSnapshot('ledger-1', { canEdit: false })).rejects.toThrow(
      CHAT_SNAPSHOT_MATERIALIZE_INCOMPLETE_REASON,
    )
  })

  it('allows viewers when every month in the window is already materialized', async () => {
    const snapshot = await loadChatSnapshot('ledger-1', { canEdit: false })

    expect(snapshot.months.map((m) => m.month)).toEqual(WINDOW_KEYS)
    expect(mockedListSkipped).toHaveBeenCalledTimes(WINDOW.length)
  })

  it('treats a month-scoped skip as not-missing only for that month', async () => {
    // Skipped in 2026-08 (so no occurrence is expected there), but 2026-09 is
    // also empty and has no skip — that one is a real materialization gap.
    mockedFetchTxns.mockResolvedValue([rentOccurrence(WINDOW_KEYS[0])])
    mockedListSkipped.mockImplementation(async (_ledgerId, ym) =>
      monthKey(ym.year, ym.month) === WINDOW_KEYS[1] ? new Set([RENT.id]) : new Set(),
    )

    await expect(loadChatSnapshot('ledger-1', { canEdit: false })).rejects.toThrow(
      CHAT_SNAPSHOT_MATERIALIZE_INCOMPLETE_REASON,
    )

    // With the current month skipped too, nothing is genuinely missing.
    mockedListSkipped.mockImplementation(async (_ledgerId, ym) =>
      monthKey(ym.year, ym.month) === WINDOW_KEYS[0] ? new Set() : new Set([RENT.id]),
    )
    await expect(loadChatSnapshot('ledger-1', { canEdit: false })).resolves.toBeDefined()
  })

  it('skips the canary entirely for editors — their materialize call already succeeded', async () => {
    mockedFetchTxns.mockResolvedValue([])

    await expect(loadChatSnapshot('ledger-1', { canEdit: true })).resolves.toBeDefined()
    expect(mockedListRecurring).not.toHaveBeenCalled()
    expect(mockedListSkipped).not.toHaveBeenCalled()
  })
})

describe('loadChatSnapshot month-to-date totals', () => {
  // NOW is 2026-09-19; the prompt presents current-month totals as "through today".
  const futureExpense: Transaction = {
    ...rentOccurrence('2026-09'),
    id: 't-future',
    txnDate: '2026-09-25',
    amount: 90_000,
    source: 'manual',
    recurringId: null,
    occurrenceMonth: null,
  }
  const todayExpense: Transaction = {
    ...futureExpense,
    id: 't-today',
    txnDate: '2026-09-19',
    amount: 10_000,
  }

  it('excludes current-month rows dated after today from totals, breakdowns, and achievements', async () => {
    mockedFetchTxns.mockResolvedValue([
      ...WINDOW_KEYS.map(rentOccurrence),
      todayExpense,
      futureExpense,
    ])

    const snapshot = await loadChatSnapshot('ledger-1', { canEdit: true })
    const current = snapshot.months.find((m) => m.month === '2026-09')!

    expect(current.expense).toBe(RENT.amount + todayExpense.amount)
    expect(current.topExpenses).toEqual([
      expect.objectContaining({ name: '주거', amount: RENT.amount + todayExpense.amount }),
    ])
    expect(snapshot.achievements).toEqual([
      expect.objectContaining({ name: '주거', actual: RENT.amount + todayExpense.amount }),
    ])
    expect(snapshot.categoryChanges).toEqual([
      expect.objectContaining({ name: '주거', latestAmount: RENT.amount + todayExpense.amount }),
    ])
  })

  it('still counts a later-this-month recurring occurrence as materialized for the viewer canary', async () => {
    const lateRent: RecurringItem = { ...RENT, dayOfMonth: 25 }
    mockedListRecurring.mockResolvedValue([lateRent])
    mockedFetchTxns.mockResolvedValue(
      WINDOW_KEYS.map((m) => ({ ...rentOccurrence(m), txnDate: `${m}-25` })),
    )

    const snapshot = await loadChatSnapshot('ledger-1', { canEdit: false })

    // Present (so no fail-closed), but not yet incurred (so not in the total).
    expect(snapshot.months.find((m) => m.month === '2026-09')!.expense).toBe(0)
    expect(snapshot.months.find((m) => m.month === '2026-08')!.expense).toBe(RENT.amount)
  })
})
