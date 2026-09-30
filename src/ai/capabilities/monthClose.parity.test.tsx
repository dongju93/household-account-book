/**
 * Behavior-equivalence guard for the shared month-close capability (S14 /
 * PR-14 acceptance): the WebMCP `month_close_review` tool and the in-app
 * narrative loader must answer identically for the same ledger state. Both
 * now delegate to `loadMonthCloseReview`, so this pins the contract at the
 * seam where a future edit to either adapter could re-introduce drift.
 */

import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import { MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON } from '../../domain/monthClose'
import type { Category, RecurringItem, Transaction } from '../../domain/types'
import { addMonths, currentYearMonth, monthKey } from '../../lib/month'
import '../../webmcp/registerWebMcpRuntime'
import { callTool } from '../../webmcp/testHelpers'
import { useMonthCloseTools } from '../../webmcp/useMonthCloseTools'

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
import { loadMonthCloseForNarrative } from '../loadMonthCloseForNarrative'

const LAST = addMonths(currentYearMonth(), -1)
const LAST_KEY = monthKey(LAST.year, LAST.month)

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
    id: 'save',
    ledgerId: 'ledger-1',
    name: '비상금',
    type: 'saving',
    icon: null,
    budgetAmount: null,
    goalAmount: 100_000,
    sortOrder: 1,
    isActive: true,
    showBudgetPace: false,
    createdAt: '',
    updatedAt: '',
  },
]

const TXNS: Transaction[] = [
  {
    id: 't1',
    ledgerId: 'ledger-1',
    categoryId: 'food',
    txnDate: `${LAST_KEY}-05`,
    type: 'expense',
    amount: 150_000,
    memo: null,
    source: 'manual',
    recurringId: null,
    occurrenceMonth: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 't2',
    ledgerId: 'ledger-1',
    categoryId: 'save',
    txnDate: `${LAST_KEY}-05`,
    type: 'saving',
    amount: 40_000,
    memo: null,
    source: 'manual',
    recurringId: null,
    occurrenceMonth: null,
    createdAt: '',
    updatedAt: '',
  },
]

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

function mountTool(canEdit: boolean) {
  const ledgerValue: LedgerValue = {
    status: 'ready',
    ledgerId: 'ledger-1',
    ledgerName: null,
    role: canEdit ? 'owner' : 'viewer',
    canEdit,
    canManage: canEdit,
    reload: () => {},
  }
  return renderHook(() => useMonthCloseTools(), {
    wrapper: ({ children }) => (
      <LedgerContext.Provider value={ledgerValue}>{children}</LedgerContext.Provider>
    ),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCategories).mockResolvedValue(CATEGORIES)
  vi.mocked(listRecurring).mockResolvedValue(RECURRING)
  vi.mocked(listSkippedRecurringIds).mockResolvedValue(new Set())
  vi.mocked(fetchTransactionsInRange).mockResolvedValue(TXNS)
  vi.mocked(materializeMonth).mockResolvedValue(undefined)
})

describe('month-close capability parity (WebMCP tool ↔ in-app loader)', () => {
  it('returns the same review for an editor', async () => {
    mountTool(true)

    const tool = (await callTool('month_close_review', { month: LAST_KEY })).structuredContent
    const inApp = await loadMonthCloseForNarrative('ledger-1', LAST, { canEdit: true })

    expect(tool).toEqual({ ready: true, ...inApp })
  })

  it('returns the same review when a skip suppresses the recurring finding', async () => {
    vi.mocked(listSkippedRecurringIds).mockResolvedValue(new Set(['r1']))
    mountTool(true)

    const tool = (await callTool('month_close_review', { month: LAST_KEY })).structuredContent
    const inApp = await loadMonthCloseForNarrative('ledger-1', LAST, { canEdit: true })

    expect(tool).toEqual({ ready: true, ...inApp })
  })

  it('refuses a viewer with the same reason on both surfaces', async () => {
    mountTool(false)

    const tool = (await callTool('month_close_review', { month: LAST_KEY })).structuredContent

    expect(tool).toEqual({ ready: false, reason: MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON })
    await expect(loadMonthCloseForNarrative('ledger-1', LAST, { canEdit: false })).rejects.toThrow(
      MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON,
    )
  })
})
