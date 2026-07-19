import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { MonthCloseFinding } from '../domain/monthClose'
import type { Category, RecurringItem, Transaction } from '../domain/types'
import { monthKey, type YearMonth } from '../lib/month'

vi.mock('../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../data/recurring', () => ({ listRecurring: vi.fn(), listSkippedRecurringIds: vi.fn() }))
vi.mock('../data/summary', () => ({ materializeMonth: vi.fn(), fetchTransactionsInRange: vi.fn() }))

import { listCategories } from '../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../data/recurring'
import { fetchTransactionsInRange, materializeMonth } from '../data/summary'
import {
  buildMonthCloseNarrativeInput,
  loadMonthCloseForNarrative,
  type MonthCloseReviewData,
} from './loadMonthCloseForNarrative'

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
]

const TXNS: Transaction[] = [
  {
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

function finding(kind: MonthCloseFinding['kind'], label: string): MonthCloseFinding {
  return { kind, label, nav: { month: YM_KEY, categoryId: 'food', memoContains: '커피' } }
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedListCategories.mockResolvedValue(CATEGORIES)
  mockedListRecurring.mockResolvedValue(RECURRING)
  mockedListSkipped.mockResolvedValue(new Set())
  mockedFetchTxns.mockResolvedValue(TXNS)
  mockedMaterializeMonth.mockResolvedValue(undefined)
})

describe('loadMonthCloseForNarrative (S07 / PR-7)', () => {
  it('materializes the month before any read, so findings can never under-count', async () => {
    let resolveMaterialize!: () => void
    mockedMaterializeMonth.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveMaterialize = resolve
      }),
    )

    const pending = loadMonthCloseForNarrative('ledger-1', YM)
    await Promise.resolve()
    expect(mockedMaterializeMonth).toHaveBeenCalledWith('ledger-1', YM)
    expect(mockedFetchTxns).not.toHaveBeenCalled()

    resolveMaterialize()
    await pending
    expect(mockedFetchTxns).toHaveBeenCalledTimes(1)
  })

  it('classifies findings like the WebMCP review (over_budget → needsCheck)', async () => {
    const review = await loadMonthCloseForNarrative('ledger-1', YM)

    expect(review.month).toBe(YM_KEY)
    expect(review.needsCheck.map((f) => f.kind)).toContain('over_budget')
    expect(review.needsCheck.map((f) => f.kind)).toContain('missing_recurring')
  })

  it('drops recurring items covered by a recurring_skips row for the month', async () => {
    mockedListSkipped.mockResolvedValue(new Set(['r1']))

    const review = await loadMonthCloseForNarrative('ledger-1', YM)

    expect(review.needsCheck.map((f) => f.kind)).not.toContain('missing_recurring')
  })
})

describe('buildMonthCloseNarrativeInput', () => {
  it('sends kind and label only — nav hints never reach the Edge payload', () => {
    const review: MonthCloseReviewData = {
      month: YM_KEY,
      needsCheck: [finding('over_budget', '식비 예산 초과')],
      forReference: [finding('under_saving_goal', '비상금 목표 미달')],
      noIssueSummary: { categoriesChecked: 1, transactionsChecked: 1 },
      truncated: false,
    }

    const input = buildMonthCloseNarrativeInput(review)

    expect(input).toEqual({
      month: YM_KEY,
      needsCheck: [{ kind: 'over_budget', label: '식비 예산 초과' }],
      forReference: [{ kind: 'under_saving_goal', label: '비상금 목표 미달' }],
      truncated: false,
    })
  })

  it('caps combined findings at 40 (needsCheck first) and flags the drop as truncated', () => {
    const review: MonthCloseReviewData = {
      month: YM_KEY,
      needsCheck: Array.from({ length: 30 }, (_, i) => finding('over_budget', `초과 ${i}`)),
      forReference: Array.from({ length: 20 }, (_, i) => finding('under_saving_goal', `미달 ${i}`)),
      noIssueSummary: { categoriesChecked: 1, transactionsChecked: 1 },
      truncated: false,
    }

    const input = buildMonthCloseNarrativeInput(review)

    expect(input.needsCheck).toHaveLength(30)
    expect(input.forReference).toHaveLength(10)
    expect(input.truncated).toBe(true)
  })
})
