import type { ModelContextWithExtensions } from '@mcp-b/webmcp-types'
import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { RefreshContext } from '../app/refreshContext'
import { LedgerContext, type LedgerValue } from '../auth/ledgerContext'
import type { Category, Transaction } from '../domain/types'
import { todayISO } from '../lib/month'
import '../webmcp/registerWebMcpRuntime'

vi.mock('../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../data/summary', () => ({
  materializeMonth: vi.fn(),
  fetchTransactionsInRange: vi.fn(),
}))

import { listCategories } from '../data/categories'
import { fetchTransactionsInRange, materializeMonth } from '../data/summary'
import { useBudgetPaceTools } from './useBudgetPaceTools'

const mockedListCategories = vi.mocked(listCategories)
const mockedFetchTxns = vi.mocked(fetchTransactionsInRange)
const mockedMaterialize = vi.mocked(materializeMonth)

// 식비 is spent over budget (always 초과, day-independent); 교통비 is barely
// touched (dailyAllowance always exceeds the even-split rate, so always 정상).
// Both names end in '비', which doubles as the ambiguous-match fixture below.
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
    showBudgetPace: true,
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
    showBudgetPace: true,
    createdAt: '',
    updatedAt: '',
  },
]

const TXNS: Transaction[] = [
  {
    id: 't1',
    ledgerId: 'ledger-1',
    categoryId: 'food',
    txnDate: todayISO(),
    type: 'expense',
    amount: 350_000,
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
    categoryId: 'transport',
    txnDate: todayISO(),
    type: 'expense',
    amount: 10_000,
    memo: null,
    source: 'manual',
    recurringId: null,
    occurrenceMonth: null,
    createdAt: '',
    updatedAt: '',
  },
]

// `document.modelContext`'s ambient type is the strict W3C `ModelContextCore`
// surface; `listTools`/`callTool` are MCP-B runtime extensions on top of it.
function modelContext(): ModelContextWithExtensions {
  return document.modelContext as unknown as ModelContextWithExtensions
}

async function callTool(name: string, args: Record<string, unknown>) {
  let response: Awaited<ReturnType<ModelContextWithExtensions['callTool']>> | undefined
  await act(async () => {
    response = await modelContext().callTool({ name, arguments: args })
  })
  if (!response) throw new Error(`callTool("${name}") did not resolve`)
  return response
}

function renderTools(ledgerId: string | null) {
  const ledgerValue: LedgerValue = {
    status: ledgerId ? 'ready' : 'loading',
    ledgerId,
    ledgerName: null,
    role: 'owner',
    canEdit: true,
    canManage: true,
    reload: () => {},
  }
  return renderHook(() => useBudgetPaceTools(), {
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
  mockedMaterialize.mockResolvedValue(undefined)
})

describe('useBudgetPaceTools', () => {
  it('registers both tools on document.modelContext', () => {
    renderTools('ledger-1')
    const names = modelContext()
      .listTools()
      .map((t) => t.name)
    expect(names).toEqual(expect.arrayContaining(['budget_pace_overview', 'budget_pace_category']))
  })

  it('budget_pace_overview returns risk-sorted categories for the current month', async () => {
    renderTools('ledger-1')

    const response = await callTool('budget_pace_overview', {})

    expect(response.structuredContent).toMatchObject({
      ready: true,
      categories: [
        expect.objectContaining({ name: '식비', status: '초과' }),
        expect.objectContaining({ name: '교통비', status: '정상' }),
      ],
    })
  })

  it('budget_pace_overview omits categories and adds a note for a past month', async () => {
    renderTools('ledger-1')

    const response = await callTool('budget_pace_overview', { month: '2000-01' })

    expect(response.structuredContent).toMatchObject({
      ready: true,
      month: '2000-01',
      note: '과거 월은 예산 페이스를 제공하지 않습니다.',
    })
    expect(response.structuredContent).not.toHaveProperty('categories')
  })

  it('budget_pace_overview reports not-ready without any data calls when the ledger is unresolved', async () => {
    renderTools(null)

    const response = await callTool('budget_pace_overview', {})

    expect(response.structuredContent).toMatchObject({ ready: false })
    expect(mockedMaterialize).not.toHaveBeenCalled()
  })

  it('budget_pace_category matches a single category by partial name', async () => {
    renderTools('ledger-1')

    const response = await callTool('budget_pace_category', { categoryName: '식비' })

    expect(response.structuredContent).toMatchObject({
      ready: true,
      matched: true,
      category: expect.objectContaining({ name: '식비', status: '초과' }),
    })
  })

  it('budget_pace_category returns candidates when the name is ambiguous', async () => {
    renderTools('ledger-1')

    const response = await callTool('budget_pace_category', { categoryName: '비' })

    expect(response.structuredContent).toMatchObject({
      ready: true,
      matched: false,
      candidates: ['식비', '교통비'],
    })
  })

  it('budget_pace_category returns no candidates for an unknown name', async () => {
    renderTools('ledger-1')

    const response = await callTool('budget_pace_category', { categoryName: '없는카테고리' })

    expect(response.structuredContent).toMatchObject({
      ready: true,
      matched: false,
      candidates: [],
    })
  })
})
