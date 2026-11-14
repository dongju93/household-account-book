import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vite-plus/test'

import { useUnsavedChanges } from './useUnsavedChanges'

afterEach(() => vi.restoreAllMocks())

describe('discard protection', () => {
  it('closes unchanged forms directly, preserves edits on cancel, and allows explicit discard', () => {
    const close = vi.fn()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const { result, rerender } = renderHook(
      ({ value, busy }) => useUnsavedChanges(value, true, busy, close),
      { initialProps: { value: 'original', busy: false } },
    )
    result.current()
    expect(close).toHaveBeenCalledTimes(1)
    expect(confirm).not.toHaveBeenCalled()
    rerender({ value: 'edited', busy: false })
    expect(result.current()).toBe(false)
    expect(close).toHaveBeenCalledTimes(1)
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    confirm.mockReturnValue(true)
    result.current()
    expect(close).toHaveBeenCalledTimes(2)
    rerender({ value: 'edited', busy: true })
    expect(result.current()).toBe(false)
    expect(close).toHaveBeenCalledTimes(2)
    rerender({ value: 'original', busy: false })
    result.current()
    expect(close).toHaveBeenCalledTimes(3)
  })

  it('does not interrupt dismissal when the owning screen preserves the draft', () => {
    const close = vi.fn()
    const confirm = vi.spyOn(window, 'confirm')
    const { result, rerender } = renderHook(
      ({ value }) => useUnsavedChanges(value, false, false, close),
      { initialProps: { value: '' } },
    )
    rerender({ value: 'draft' })
    result.current()
    expect(close).toHaveBeenCalledOnce()
    expect(confirm).not.toHaveBeenCalled()
  })
})
