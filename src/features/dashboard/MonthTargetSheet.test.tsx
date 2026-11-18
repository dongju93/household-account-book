import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { saveCategoryMonthTarget } from '../../data/categoryMonthTargets'
import { parseTargetAmount } from '../../domain/categoryMonthTargets'
import type { Category } from '../../domain/types'
import { MonthTargetSheet } from './MonthTargetSheet'

vi.mock('../../data/categoryMonthTargets', () => ({ saveCategoryMonthTarget: vi.fn() }))
const category: Category = {
  id: 'food',
  ledgerId: 'ledger',
  name: '식비',
  type: 'expense',
  icon: null,
  budgetAmount: 500000,
  goalAmount: null,
  showBudgetPace: false,
  sortOrder: 0,
  isActive: true,
  createdAt: '',
  updatedAt: '',
}
const ym = { year: 2026, month: 11 }
const onClose = vi.fn()
const onSaved = vi.fn()

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(saveCategoryMonthTarget).mockResolvedValue()
})
afterEach(() => vi.restoreAllMocks())

describe('category/month edit session', () => {
  it('edits a prefilled amount without writing until Save', async () => {
    const user = userEvent.setup()
    render(<MonthTargetSheet category={category} ym={ym} onClose={onClose} onSaved={onSaved} />)
    expect(screen.getByRole('radio', { name: /글로벌 설정 사용/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: '이 달 금액 사용' }))
    const amount = screen.getByLabelText('이 달 예산 (원)')
    expect(amount).toHaveValue('500000')
    await user.clear(amount)
    await user.type(amount, '600,000')
    expect(saveCategoryMonthTarget).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
    expect(saveCategoryMonthTarget).toHaveBeenCalledWith(category, ym, {
      source: 'custom',
      amount: 600000,
    })
  })
  it('restores the saved adjustment while global is active, and global Save sends no amount', async () => {
    const user = userEvent.setup()
    render(
      <MonthTargetSheet
        category={category}
        ym={ym}
        target={{
          categoryId: category.id,
          month: '2026-11-01',
          source: 'global',
          customAmount: parseTargetAmount(600000)!,
        }}
        onClose={onClose}
        onSaved={onSaved}
      />,
    )
    await user.click(screen.getByRole('radio', { name: '이 달 금액 사용' }))
    expect(screen.getByLabelText('이 달 예산 (원)')).toHaveValue('600000')
    await user.click(screen.getByRole('radio', { name: /글로벌 설정 사용/ }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(saveCategoryMonthTarget).toHaveBeenCalledWith(category, ym, { source: 'global' }),
    )
  })
  it('rejects fractional input and focuses the invalid field', async () => {
    const user = userEvent.setup()
    render(<MonthTargetSheet category={category} ym={ym} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('radio', { name: '이 달 금액 사용' }))
    const amount = screen.getByLabelText('이 달 예산 (원)')
    await user.clear(amount)
    await user.type(amount, '1.5')
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(amount).toHaveFocus()
    expect(amount).toHaveAttribute('aria-invalid', 'true')
    expect(saveCategoryMonthTarget).not.toHaveBeenCalled()
  })
  it('discards only after confirmation and never writes on cancellation', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<MonthTargetSheet category={category} ym={ym} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('radio', { name: '이 달 금액 사용' }))
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(onClose).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '취소' }))
    expect(confirm).toHaveBeenCalledTimes(2)
    expect(onClose).toHaveBeenCalledOnce()
    expect(saveCategoryMonthTarget).not.toHaveBeenCalled()
  })
  it('keeps failed saves open and shows server errors', async () => {
    const user = userEvent.setup()
    vi.mocked(saveCategoryMonthTarget).mockRejectedValue({ code: '42501' })
    render(<MonthTargetSheet category={category} ym={ym} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('이 작업을 수행할 권한이 없습니다.')).toBeInTheDocument()
    expect(onSaved).not.toHaveBeenCalled()
  })
  it('blocks close and duplicate submissions during a pending save', async () => {
    const user = userEvent.setup()
    let finish!: () => void
    vi.mocked(saveCategoryMonthTarget).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
    render(<MonthTargetSheet category={category} ym={ym} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('button', { name: '저장 중…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '취소' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: '닫기' }))
    expect(onClose).not.toHaveBeenCalled()
    expect(saveCategoryMonthTarget).toHaveBeenCalledOnce()
    finish()
    await waitFor(() => expect(onSaved).toHaveBeenCalledOnce())
  })
  it('labels a saving category as a goal and accepts an explicit zero', async () => {
    const user = userEvent.setup()
    const saving: Category = {
      ...category,
      type: 'saving',
      budgetAmount: null,
      goalAmount: null,
      name: '비상금',
    }
    render(<MonthTargetSheet category={saving} ym={ym} onClose={onClose} onSaved={onSaved} />)
    await user.click(screen.getByRole('radio', { name: '이 달 금액 사용' }))
    await user.type(screen.getByLabelText('이 달 목표 (원)'), '0')
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() =>
      expect(saveCategoryMonthTarget).toHaveBeenCalledWith(saving, ym, {
        source: 'custom',
        amount: 0,
      }),
    )
  })
})
