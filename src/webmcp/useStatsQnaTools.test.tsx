import { renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { RefreshContext } from '../app/refreshContext'
import { LedgerContext, type LedgerValue } from '../auth/ledgerContext'
import type { Category, Transaction } from '../domain/types'
import { addMonths, currentYearMonth, monthKey } from '../lib/month'
import '../webmcp/registerWebMcpRuntime'
import { callTool, registeredToolNames } from './testHelpers'

vi.mock('../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../data/summary', () => ({
  materializeMonth: vi.fn(),
  materializeMonths: vi.fn(),
  fetchTransactionsInRange: vi.fn(),
}))

import { listCategories } from '../data/categories'
import { fetchTransactionsInRange, materializeMonth, materializeMonths } from '../data/summary'
import { useStatsQnaTools } from './useStatsQnaTools'

const mockedListCategories = vi.mocked(listCategories)
const mockedFetchTxns = vi.mocked(fetchTransactionsInRange)
const mockedMaterializeMonth = vi.mocked(materializeMonth)
const mockedMaterializeMonths = vi.mocked(materializeMonths)

const CURRENT = currentYearMonth()
const PREVIOUS = addMonths(CURRENT, -1)
const CURRENT_KEY = monthKey(CURRENT.year, CURRENT.month)
const PREVIOUS_KEY = monthKey(PREVIOUS.year, PREVIOUS.month)

// Both expense names end in '비' (the ambiguous-match fixture). Food rises
// month-over-month (+50,000 / +50%), transport falls (-40,000 / -50%).
const CATEGORIES: Category[] = [
  {
    id: 'food',
    ledgerId: 'ledger-1',
    name: '식비',
    type: 'expense',
    icon: null,
    budgetAmount: 300_000,
    goalAmount: null,
    sortOrder: 0,
    isActive: true,
    showBudgetPace: false,
    createdAt: '',
    updatedAt: '',
  },
  {
    id: 'transport',
    ledgerId: 'ledger-1',
    name: '교통비',
    type: 'expense',
    icon: null,
    budgetAmount: 100_000,
    goalAmount: null,
    sortOrder: 1,
    isActive: true,
    showBudgetPace: false,
    createdAt: '',
    updatedAt: '',
  },
]

function txn(
  id: string,
  categoryId: string,
  date: string,
  type: Transaction['type'],
  amount: number,
): Transaction {
  return {
    id,
    ledgerId: 'ledger-1',
    categoryId,
    txnDate: date,
    type,
    amount,
    memo: null,
    source: 'manual',
    recurringId: null,
    occurrenceMonth: null,
    createdAt: '',
    updatedAt: '',
  }
}

const TXNS: Transaction[] = [
  txn('t1', 'food', `${CURRENT_KEY}-10`, 'expense', 150_000),
  txn('t2', 'transport', `${CURRENT_KEY}-05`, 'expense', 40_000),
  txn('t3', 'salary', `${CURRENT_KEY}-01`, 'income', 3_000_000),
  txn('t4', 'food', `${PREVIOUS_KEY}-10`, 'expense', 100_000),
  txn('t5', 'transport', `${PREVIOUS_KEY}-05`, 'expense', 80_000),
]

function renderTools(ledgerId: string | null, period: 3 | 6 | 12 = 6, ready = true) {
  const ledgerValue: LedgerValue = {
    status: ledgerId ? 'ready' : 'loading',
    ledgerId,
    ledgerName: null,
    role: 'owner',
    canEdit: true,
    canManage: true,
    reload: () => {},
  }
  return renderHook(() => useStatsQnaTools(period, ready), {
    wrapper: ({ children }) => (
      <LedgerContext.Provider value={ledgerValue}>
        <RefreshContext.Provider value={{ version: 0, refresh: () => {} }}>
          {children}
        </RefreshContext.Provider>
      </LedgerContext.Provider>
    ),
  })
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedListCategories.mockResolvedValue(CATEGORIES)
  mockedFetchTxns.mockResolvedValue(TXNS)
})

describe('useStatsQnaTools', () => {
  it('registers the three qna tools on document.modelContext', async () => {
    renderTools('ledger-1')
    const names = await registeredToolNames()
    expect(names).toEqual(
      expect.arrayContaining(['qna_monthly_trend', 'qna_category_detail', 'qna_compare_periods']),
    )
  })

  it('qna_monthly_trend returns the screen-period trend with top/rising categories', async () => {
    renderTools('ledger-1', 6)

    const response = await callTool('qna_monthly_trend', {})
    const output = response.structuredContent as {
      ready: boolean
      periodMonths: number
      months: { month: string; totalExpense: number }[]
      topCategories: unknown[]
      risingCategories: unknown[]
    }

    expect(output.ready).toBe(true)
    expect(output.periodMonths).toBe(6)
    expect(output.months).toHaveLength(6)
    expect(output.months.at(-1)).toMatchObject({
      month: CURRENT_KEY,
      totalIncome: 3_000_000,
      totalExpense: 190_000,
      balance: 2_810_000,
    })
    expect(output.topCategories).toEqual([
      expect.objectContaining({ categoryId: 'food', amount: 250_000 }),
      expect.objectContaining({ categoryId: 'transport', amount: 120_000 }),
    ])
    expect(output.risingCategories).toEqual([
      expect.objectContaining({ categoryId: 'food', delta: 50_000, deltaPct: 50 }),
      expect.objectContaining({ categoryId: 'transport', delta: -40_000, deltaPct: -50 }),
    ])
  })

  it('qna_monthly_trend lets periodMonths override the screen period', async () => {
    renderTools('ledger-1', 6)

    const response = await callTool('qna_monthly_trend', { periodMonths: 3 })

    expect(response.structuredContent).toMatchObject({ ready: true, periodMonths: 3 })
    expect((response.structuredContent as { months: unknown[] }).months).toHaveLength(3)
  })

  it('tools report not-ready without data calls or materialization when the ledger is unresolved', async () => {
    renderTools(null)

    const response = await callTool('qna_monthly_trend', {})

    expect(response.structuredContent).toMatchObject({ ready: false })
    expect(mockedFetchTxns).not.toHaveBeenCalled()
  })

  it('gates every tool on the screen readiness flag before its window is materialized', async () => {
    renderTools('ledger-1', 6, false)

    const trend = await callTool('qna_monthly_trend', {})
    const detail = await callTool('qna_category_detail', { categoryName: '식비' })
    const compare = await callTool('qna_compare_periods', {})

    expect(trend.structuredContent).toMatchObject({ ready: false })
    expect(detail.structuredContent).toMatchObject({ ready: false, matched: false })
    expect(compare.structuredContent).toMatchObject({ ready: false })
    expect(mockedFetchTxns).not.toHaveBeenCalled()
    expect(mockedListCategories).not.toHaveBeenCalled()
  })

  it('never materializes months (read-only tools must not write)', async () => {
    renderTools('ledger-1')

    await callTool('qna_monthly_trend', {})
    await callTool('qna_category_detail', { categoryName: '식비' })
    await callTool('qna_compare_periods', {})

    expect(mockedMaterializeMonth).not.toHaveBeenCalled()
    expect(mockedMaterializeMonths).not.toHaveBeenCalled()
  })

  it('qna_category_detail returns per-month amounts and the period total for a unique match', async () => {
    renderTools('ledger-1', 6)

    const response = await callTool('qna_category_detail', { categoryName: '식비' })
    const output = response.structuredContent as {
      matched: boolean
      category: { months: { month: string; amount: number }[]; totalAmount: number }
    }

    expect(output.matched).toBe(true)
    expect(output.category).toMatchObject({
      categoryId: 'food',
      name: '식비',
      totalAmount: 250_000,
    })
    expect(output.category.months).toHaveLength(6)
    expect(output.category.months.at(-2)).toEqual({ month: PREVIOUS_KEY, amount: 100_000 })
    expect(output.category.months.at(-1)).toEqual({ month: CURRENT_KEY, amount: 150_000 })
  })

  it('qna_category_detail returns candidates when the name is ambiguous', async () => {
    renderTools('ledger-1')

    const response = await callTool('qna_category_detail', { categoryName: '비' })

    expect(response.structuredContent).toMatchObject({
      ready: true,
      matched: false,
      candidates: ['식비', '교통비'],
    })
  })

  it('qna_category_detail aggregates a same-name inactive category instead of reporting false ambiguity', async () => {
    // categories_unique_active_name only enforces uniqueness among active
    // rows, so a rename/deactivate/recreate cycle can leave an inactive '식비'
    // row alongside the active one. Both should be matched and their
    // transactions summed together.
    const archivedFood: Category = {
      ...CATEGORIES[0],
      id: 'food-archived',
      isActive: false,
    }
    mockedListCategories.mockResolvedValue([...CATEGORIES, archivedFood])
    mockedFetchTxns.mockResolvedValue([
      ...TXNS,
      txn('t6', 'food-archived', `${CURRENT_KEY}-15`, 'expense', 20_000),
    ])
    renderTools('ledger-1', 6)

    const response = await callTool('qna_category_detail', { categoryName: '식비' })
    const output = response.structuredContent as {
      matched: boolean
      candidates?: string[]
      category: { categoryId: string; name: string; totalAmount: number }
    }

    expect(output.matched).toBe(true)
    expect(output.candidates).toBeUndefined()
    expect(output.category).toMatchObject({
      categoryId: 'food',
      name: '식비',
      totalAmount: 270_000,
    })
  })

  it('qna_compare_periods returns both month summaries and raw deltas only', async () => {
    renderTools('ledger-1')

    const response = await callTool('qna_compare_periods', {})

    expect(response.structuredContent).toMatchObject({
      ready: true,
      current: expect.objectContaining({ month: CURRENT_KEY, totalExpense: 190_000 }),
      previous: expect.objectContaining({ month: PREVIOUS_KEY, totalExpense: 180_000 }),
      deltas: {
        income: 3_000_000,
        expense: 10_000,
        saving: 0,
        investment: 0,
        balance: 2_990_000,
      },
    })
  })
})
