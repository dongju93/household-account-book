import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vite-plus/test'

import { currentYearMonth } from '../lib/month'
import { MonthNav } from './layout'

describe('month navigation', () => {
  it('keeps arrow shortcuts and allows selecting a distant month or returning to this month', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    const onPrev = vi.fn()
    const onNext = vi.fn()
    render(
      <MonthNav
        value={{ year: 2025, month: 2 }}
        onChange={onChange}
        onPrev={onPrev}
        onNext={onNext}
      />,
    )
    await user.click(screen.getByRole('button', { name: '이전 달' }))
    await user.click(screen.getByRole('button', { name: '다음 달' }))
    expect(onPrev).toHaveBeenCalledOnce()
    expect(onNext).toHaveBeenCalledOnce()
    await user.click(screen.getByRole('button', { name: '2025.02 월 선택' }))
    fireEvent.change(screen.getByLabelText('조회할 월'), { target: { value: '2023-12' } })
    expect(onChange).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '이동' }))
    expect(onChange).toHaveBeenLastCalledWith({ year: 2023, month: 12 })
    await user.click(screen.getByRole('button', { name: '2025.02 월 선택' }))
    await user.click(screen.getByRole('button', { name: '이번 달로 이동' }))
    expect(onChange).toHaveBeenLastCalledWith(currentYearMonth())
  })
})
