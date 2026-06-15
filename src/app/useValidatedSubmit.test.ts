import { renderHook, act } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { useValidatedSubmit } from './useValidatedSubmit'

describe('useValidatedSubmit', () => {
  it('sets field errors when validation fails', async () => {
    const { result } = renderHook(() => useValidatedSubmit())

    let ok = false
    await act(async () => {
      ok = await result.current.run(
        () => ({ ok: false as const, errors: { name: 'required' } }),
        async () => {},
      )
    })

    expect(ok).toBe(false)
    expect(result.current.errors.name).toBe('required')
    expect(result.current.saving).toBe(false)
  })

  it('runs action and clears errors on success', async () => {
    const { result } = renderHook(() => useValidatedSubmit())
    const action = vi.fn(async () => {})

    let ok = false
    await act(async () => {
      ok = await result.current.run(() => ({ ok: true as const, value: { name: '식비' } }), action)
    })

    expect(ok).toBe(true)
    expect(action).toHaveBeenCalledWith({ name: '식비' })
    expect(result.current.errors).toEqual({})
    expect(result.current.submitError).toBeNull()
  })
})
