import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { RefreshProvider } from '../../app/refresh'
import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import { listCategories } from '../../data/categories'
import { listCategoryMonthTargets, saveCategoryMonthTarget } from '../../data/categoryMonthTargets'
import { type CategoryMonthTarget, parseTargetAmount } from '../../domain/categoryMonthTargets'
import type { Category } from '../../domain/types'
import { currentYearMonth, monthKey } from '../../lib/month'
import { DashboardPage } from './DashboardPage'

vi.mock('../../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../../data/categoryMonthTargets', () => ({
  listCategoryMonthTargets: vi.fn(),
  saveCategoryMonthTarget: vi.fn(),
}))
vi.mock('../../data/summary', () => ({
  materializeMonths: vi.fn(async () => {}),
  fetchTransactionsInRange: vi.fn(async () => []),
}))
vi.mock('../../webmcp/useBudgetPaceTools', () => ({ useBudgetPaceTools: vi.fn() }))
vi.mock('./AiInsightCard', () => ({ AiInsightCard: () => null }))
vi.mock('./MonthCloseSection', () => ({ MonthCloseSection: () => null }))
vi.mock('./DashboardCharts', () => ({ DashboardCharts: () => null }))

const food: Category = {
  id: 'food',
  ledgerId: 'ledger',
  name: '식비',
  type: 'expense',
  icon: null,
  budgetAmount: 500000,
  goalAmount: null,
  showBudgetPace: false,
  isActive: true,
  sortOrder: 0,
  createdAt: '',
  updatedAt: '',
}
const categories = [
  food,
  { ...food, id: 'travel', name: '교통', budgetAmount: null },
  {
    ...food,
    id: 'saving',
    name: '비상금',
    type: 'saving' as const,
    budgetAmount: null,
    goalAmount: 1000000,
  },
]
let targets: CategoryMonthTarget[]
const now = currentYearMonth()
const currentMonth = `${monthKey(now.year, now.month)}-01`

beforeEach(() => {
  vi.clearAllMocks()
  targets = []
  vi.mocked(listCategories).mockResolvedValue(categories)
  vi.mocked(listCategoryMonthTargets).mockImplementation(async (_ledgerId, ym) =>
    targets.filter((t) => t.month === `${monthKey(ym.year, ym.month)}-01`),
  )
  vi.mocked(saveCategoryMonthTarget).mockImplementation(async (category, ym, choice) => {
    const month = `${monthKey(ym.year, ym.month)}-01`
    const previous = targets.find((t) => t.categoryId === category.id && t.month === month)
    if (choice.source === 'custom') {
      targets = [
        ...targets.filter((t) => t !== previous),
        { categoryId: category.id, month, source: 'custom', customAmount: choice.amount },
      ]
    } else if (previous) {
      targets = targets.map((t) => (t === previous ? { ...t, source: 'global' } : t))
    }
  })
})

function renderDashboard(canManage = true) {
  const ledger: LedgerValue = {
    status: 'ready',
    ledgerId: 'ledger',
    ledgerName: '가계부',
    role: canManage ? 'owner' : 'viewer',
    canEdit: canManage,
    canManage,
    reload: () => {},
  }
  return render(
    <LedgerContext.Provider value={ledger}>
      <RefreshProvider>
        <DashboardPage />
      </RefreshProvider>
    </LedgerContext.Provider>,
  )
}
const foodRow = () => screen.getByRole('button', { name: '식비 예산 편집' }).closest('li')!

describe('monthly target dashboard flow', () => {
  it('saves per category, switches both ways, and retains the choice across month navigation', async () => {
    const user = userEvent.setup()
    renderDashboard()
    await user.click(await screen.findByRole('button', { name: '식비 예산 편집' }))
    await user.click(screen.getByRole('radio', { name: '이 달 금액 사용' }))
    await user.clear(screen.getByLabelText('이 달 예산 (원)'))
    await user.type(screen.getByLabelText('이 달 예산 (원)'), '600000')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(within(foodRow()).getByText('수정')).toBeInTheDocument())
    expect(foodRow()).toHaveTextContent('₩600,000')
    expect(screen.getByRole('button', { name: '교통 예산 편집' })).toBeInTheDocument()
    expect(targets).toHaveLength(1)

    await user.click(screen.getByRole('button', { name: '식비 예산 편집' }))
    await user.click(screen.getByRole('radio', { name: /글로벌 설정 사용/ }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(within(foodRow()).queryByText('수정')).not.toBeInTheDocument())
    expect(foodRow()).toHaveTextContent('₩500,000')
    expect(targets[0].customAmount).toBe(600000)

    await user.click(screen.getByRole('button', { name: '식비 예산 편집' }))
    await user.click(screen.getByRole('radio', { name: '이 달 금액 사용' }))
    expect(screen.getByLabelText('이 달 예산 (원)')).toHaveValue('600000')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(within(foodRow()).getByText('수정')).toBeInTheDocument())

    await user.click(screen.getByRole('button', { name: '이전 달' }))
    await waitFor(() => expect(within(foodRow()).queryByText('수정')).not.toBeInTheDocument())
    expect(foodRow()).toHaveTextContent('₩500,000')
    await user.click(screen.getByRole('button', { name: '다음 달' }))
    await waitFor(() => expect(within(foodRow()).getByText('수정')).toBeInTheDocument())
    expect(foodRow()).toHaveTextContent('₩600,000')
    expect(categories[0].budgetAmount).toBe(500000)
  })
  it('shows an active custom marker even when the amount equals the global value; viewers cannot edit', async () => {
    targets = [
      {
        categoryId: 'food',
        month: currentMonth,
        source: 'custom',
        customAmount: parseTargetAmount(500000)!,
      },
    ]
    renderDashboard(false)
    expect(await screen.findByText('수정')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /편집/ })).not.toBeInTheDocument()
  })
  it('surfaces failed monthly reads instead of displaying incorrect global targets', async () => {
    vi.mocked(listCategoryMonthTargets).mockRejectedValue(new Error('월별 금액 조회 실패'))
    renderDashboard()
    expect(await screen.findByText('월별 금액 조회 실패')).toBeInTheDocument()
    expect(screen.queryByText('달성 확인')).not.toBeInTheDocument()
  })
})
