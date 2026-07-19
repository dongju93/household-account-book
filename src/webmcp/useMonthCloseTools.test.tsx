import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { LedgerContext, type LedgerValue } from '../auth/ledgerContext'
import { MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON } from '../domain/monthClose'
import type { Category, RecurringItem, Transaction } from '../domain/types'
import { addMonths, currentYearMonth, monthKey } from '../lib/month'
import '../webmcp/registerWebMcpRuntime'
import { callTool, registeredToolNames } from './testHelpers'

vi.mock('../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../data/recurring', () => ({ listRecurring: vi.fn(), listSkippedRecurringIds: vi.fn() }))
vi.mock('../data/summary', () => ({ materializeMonth: vi.fn(), fetchTransactionsInRange: vi.fn() }))

import { listCategories } from '../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../data/recurring'
import { fetchTransactionsInRange, materializeMonth } from '../data/summary'
import { useMonthCloseTools } from './useMonthCloseTools'

const mockedListCategories = vi.mocked(listCategories)
const mockedListRecurring = vi.mocked(listRecurring)
const mockedListSkipped = vi.mocked(listSkippedRecurringIds)
const mockedFetchTxns = vi.mocked(fetchTransactionsInRange)
const mockedMaterializeMonth = vi.mocked(materializeMonth)

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

function renderTools(ledgerId: string | null, { canEdit = true }: { canEdit?: boolean } = {}) {
  const ledgerValue: LedgerValue = {
    status: ledgerId ? 'ready' : 'loading',
    ledgerId,
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
  mockedListCategories.mockResolvedValue(CATEGORIES)
  mockedListRecurring.mockResolvedValue(RECURRING)
  mockedListSkipped.mockResolvedValue(new Set())
  mockedFetchTxns.mockResolvedValue(TXNS)
  mockedMaterializeMonth.mockResolvedValue(undefined)
})

describe('useMonthCloseTools', () => {
  it('registers month_close_review on document.modelContext', async () => {
    renderTools('ledger-1')
    const names = await registeredToolNames()
    expect(names).toContain('month_close_review')
  })

  it('reports not-ready without any data calls when the ledger is unresolved', async () => {
    renderTools(null)

    const response = await callTool('month_close_review', {})

    expect(response.structuredContent).toMatchObject({ ready: false })
    expect(mockedMaterializeMonth).not.toHaveBeenCalled()
  })

  it('defaults to last month and classifies over_budget as needsCheck, under_saving_goal as forReference', async () => {
    renderTools('ledger-1')

    const response = await callTool('month_close_review', {})

    expect(mockedMaterializeMonth).toHaveBeenCalledWith('ledger-1', LAST)
    const content = response.structuredContent as {
      ready: boolean
      month: string
      needsCheck: { kind: string }[]
      forReference: { kind: string }[]
      truncated: boolean
    }
    expect(content.ready).toBe(true)
    expect(content.month).toBe(LAST_KEY)
    expect(content.needsCheck.map((f) => f.kind)).toContain('over_budget')
    expect(content.forReference.map((f) => f.kind)).toContain('under_saving_goal')
    expect(content.truncated).toBe(false)
  })

  it('flags a missing recurring occurrence not covered by a skip', async () => {
    renderTools('ledger-1')

    const response = await callTool('month_close_review', {})

    const content = response.structuredContent as { needsCheck: { kind: string }[] }
    expect(content.needsCheck.map((f) => f.kind)).toContain('missing_recurring')
  })

  it('does not flag a recurring item covered by a recurring_skips row for the month', async () => {
    mockedListSkipped.mockResolvedValue(new Set(['r1']))
    renderTools('ledger-1')

    const response = await callTool('month_close_review', {})

    const content = response.structuredContent as { needsCheck: { kind: string }[] }
    expect(content.needsCheck.map((f) => f.kind)).not.toContain('missing_recurring')
  })

  it('returns ready:false for a month string with an out-of-range month number', async () => {
    renderTools('ledger-1')

    // Matches the input schema's YYYY-MM pattern but "13" is not a valid month,
    // so this exercises parseMonthKey's range check rather than schema validation.
    const response = await callTool('month_close_review', { month: '2026-13' })

    expect(response.structuredContent).toMatchObject({ ready: false })
    expect(mockedMaterializeMonth).not.toHaveBeenCalled()
  })

  it('fails closed for viewers when eligible recurring occurrences are still missing', async () => {
    renderTools('ledger-1', { canEdit: false })

    const response = await callTool('month_close_review', {})

    expect(response.structuredContent).toEqual({
      ready: false,
      reason: MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON,
    })
  })

  it('allows viewers when every eligible recurring occurrence is already materialized', async () => {
    mockedFetchTxns.mockResolvedValue([
      ...TXNS,
      {
        id: 't-rec',
        ledgerId: 'ledger-1',
        categoryId: 'food',
        txnDate: `${LAST_KEY}-01`,
        type: 'expense',
        amount: 500_000,
        memo: null,
        source: 'recurring',
        recurringId: 'r1',
        occurrenceMonth: `${LAST_KEY}-01`,
        createdAt: '',
        updatedAt: '',
      },
    ])
    renderTools('ledger-1', { canEdit: false })

    const response = await callTool('month_close_review', {})

    const content = response.structuredContent as {
      ready: boolean
      needsCheck: { kind: string }[]
    }
    expect(content.ready).toBe(true)
    expect(content.needsCheck.map((f) => f.kind)).not.toContain('missing_recurring')
  })
})
