import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { usePaginatedList, type PaginatedPage } from './usePaginatedList'

describe('paginated list recovery', () => {
  it('retries an initial failure and preserves the query', async () => {
    const loadPage = vi
      .fn()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue({ rows: ['one'], nextCursor: null })
    const { result } = renderHook(() =>
      usePaginatedList<string, string>({ listKey: 'month', loadPage }),
    )
    await waitFor(() => expect(result.current.error).not.toBeNull())
    act(() => result.current.retry())
    await waitFor(() => expect(result.current.rows).toEqual(['one']))
    expect(result.current.error).toBeNull()
    expect(loadPage.mock.calls).toEqual([[null], [null]])
  })

  it('retains loaded rows after load-more failure and retries the same cursor without duplicates', async () => {
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ rows: ['one'], nextCursor: 'cursor' })
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce({ rows: ['two'], nextCursor: null })
    const { result } = renderHook(() =>
      usePaginatedList<string, string>({ listKey: 'month', loadPage }),
    )
    await waitFor(() => expect(result.current.rows).toEqual(['one']))
    await act(() => result.current.loadMore())
    expect(result.current.rows).toEqual(['one'])
    expect(result.current.error).toBeNull()
    expect(result.current.loadMoreError).not.toBeNull()
    expect(result.current.hasMore).toBe(true)
    await act(() => result.current.loadMore())
    expect(result.current.rows).toEqual(['one', 'two'])
    expect(result.current.loadMoreError).toBeNull()
    expect(loadPage.mock.calls).toEqual([[null], ['cursor'], ['cursor']])
  })

  it('discards a late load-more response after the user changes months', async () => {
    let release!: (page: PaginatedPage<string, string>) => void
    const loadPage = vi
      .fn()
      .mockResolvedValueOnce({ rows: ['old'], nextCursor: 'cursor' })
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            release = resolve
          }),
      )
      .mockResolvedValueOnce({ rows: ['new'], nextCursor: null })
    const { result, rerender } = renderHook(
      ({ key }) => usePaginatedList<string, string>({ listKey: key, loadPage }),
      { initialProps: { key: 'old' } },
    )
    await waitFor(() => expect(result.current.rows).toEqual(['old']))
    let pending!: Promise<void>
    act(() => {
      pending = result.current.loadMore()
    })
    rerender({ key: 'new' })
    await waitFor(() => expect(result.current.rows).toEqual(['new']))
    await act(async () => {
      release({ rows: ['late'], nextCursor: null })
      await pending
    })
    expect(result.current.rows).toEqual(['new'])
    expect(result.current.loadingMore).toBe(false)
  })
})
