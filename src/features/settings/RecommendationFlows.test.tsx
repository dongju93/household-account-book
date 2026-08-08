import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { RefreshContext } from '../../app/refreshContext'
import type { CategoryBudgetSuggestion } from '../../domain/budgetSuggestions'
import type { RecurringSuggestion } from '../../domain/recurringSuggestions'
import type { Category } from '../../domain/types'
import { addMonths, currentYearMonth, monthKey } from '../../lib/month'

vi.mock('../../data/categories', () => ({
  createCategory: vi.fn(),
  listCategories: vi.fn(),
  reorderCategories: vi.fn(),
  setCategoryActive: vi.fn(),
  updateCategory: vi.fn(),
}))
vi.mock('../../data/recurring', () => ({
  createRecurring: vi.fn(),
  listRecurring: vi.fn(),
  setRecurringActive: vi.fn(),
  updateRecurring: vi.fn(),
}))

import { listCategories, updateCategory } from '../../data/categories'
import { createRecurring, listRecurring } from '../../data/recurring'
import { CategoryFormSheet } from './CategoryFormSheet'
import { RecurringFormSheet } from './RecurringFormSheet'
import { RecurringManager } from './RecurringManager'

const LEDGER_ID = 'ledger-1'
const EXPENSE_CATEGORY: Category = {
  id: 'housing',
  ledgerId: LEDGER_ID,
  name: '주거',
  type: 'expense',
  icon: 'home',
  budgetAmount: 100_000,
  goalAmount: null,
  sortOrder: 0,
  isActive: true,
  showBudgetPace: false,
  createdAt: '2025-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
}

const BUDGET_SUGGESTION: CategoryBudgetSuggestion = {
  categoryId: EXPENSE_CATEGORY.id,
  categoryName: EXPENSE_CATEGORY.name,
  currentAmount: 100_000,
  suggestedAmount: 120_000,
  difference: 20_000,
  medianAmount: 105_000,
  maxAmount: 130_000,
  observedMonths: 6,
  monthsWithSpend: 6,
}

const RECURRING_SUGGESTION: RecurringSuggestion = {
  categoryId: EXPENSE_CATEGORY.id,
  categoryName: EXPENSE_CATEGORY.name,
  type: 'expense',
  name: '월세',
  amount: 505_000,
  dayOfMonth: 10,
  memo: '월세',
  months: ['2026-05', '2026-06', '2026-07'],
  amountMin: 500_000,
  amountMax: 510_000,
  dayMin: 9,
  dayMax: 11,
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCategories).mockResolvedValue([EXPENSE_CATEGORY])
  vi.mocked(listRecurring).mockResolvedValue([])
})

describe('S10 recommendation confirmation flows', () => {
  it('only prefills a category budget and writes through the existing Save path', async () => {
    const user = userEvent.setup()
    vi.mocked(updateCategory).mockResolvedValue()
    render(
      <CategoryFormSheet
        open
        onClose={() => {}}
        ledgerId={LEDGER_ID}
        target={{
          kind: 'edit',
          category: EXPENSE_CATEGORY,
          budgetSuggestion: BUDGET_SUGGESTION,
        }}
        onSaved={() => {}}
      />,
    )

    const amount = screen.getByPlaceholderText('0')
    expect(amount).toHaveValue('100000')
    await user.click(screen.getByRole('button', { name: '제안 금액 입력' }))

    expect(amount).toHaveValue('120000')
    expect(updateCategory).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => {
      expect(updateCategory).toHaveBeenCalledWith(EXPENSE_CATEGORY.id, {
        name: '주거',
        icon: 'home',
        budgetAmount: 120_000,
        goalAmount: null,
        showBudgetPace: false,
      })
    })
  })

  it('opens a recurring suggestion as a next-month draft and never creates it before Save', async () => {
    const user = userEvent.setup()
    vi.mocked(createRecurring).mockResolvedValue(undefined as never)
    render(
      <RecurringFormSheet
        open
        onClose={() => {}}
        ledgerId={LEDGER_ID}
        target={{ kind: 'suggestion', suggestion: RECURRING_SUGGESTION }}
        categories={[EXPENSE_CATEGORY]}
        onSaved={() => {}}
      />,
    )

    const nextMonth = addMonths(currentYearMonth(), 1)
    expect(screen.getByPlaceholderText('예: 월급')).toHaveValue('월세')
    expect(screen.getByPlaceholderText('메모')).toHaveValue('월세')
    expect(screen.getByPlaceholderText('0')).toHaveValue('505000')
    expect(screen.getByDisplayValue(monthKey(nextMonth.year, nextMonth.month))).toBeInTheDocument()
    expect(createRecurring).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => {
      expect(createRecurring).toHaveBeenCalledWith(LEDGER_ID, {
        name: '월세',
        type: 'expense',
        categoryId: 'housing',
        amount: 505_000,
        startMonth: monthKey(nextMonth.year, nextMonth.month),
        endMonth: null,
        dayOfMonth: 10,
        memo: '월세',
      })
    })
  })

  it('shows recurring suggestions even when the recurring list is otherwise empty', async () => {
    const user = userEvent.setup()
    const history = RECURRING_SUGGESTION.months.map((month, index) => ({
      id: `txn-${index}`,
      ledgerId: LEDGER_ID,
      categoryId: EXPENSE_CATEGORY.id,
      txnDate: `${month}-${String(9 + index).padStart(2, '0')}`,
      type: 'expense' as const,
      amount: 500_000 + index * 5_000,
      memo: '월세',
      source: 'manual' as const,
      recurringId: null,
      occurrenceMonth: null,
      createdAt: `${month}-10T00:00:00Z`,
      updatedAt: `${month}-10T00:00:00Z`,
    }))

    render(
      <RefreshContext.Provider value={{ version: 0, refresh: () => {} }}>
        <RecurringManager ledgerId={LEDGER_ID} canEdit historyTransactions={history} />
      </RefreshContext.Provider>,
    )

    const openDraft = await screen.findByRole('button', { name: '월세 고정 항목 초안 확인' })
    expect(screen.queryByText('고정 항목이 없습니다')).not.toBeInTheDocument()
    await user.click(openDraft)
    expect(await screen.findByRole('heading', { name: '고정 항목 초안 확인' })).toBeInTheDocument()
    expect(createRecurring).not.toHaveBeenCalled()
  })
})
