import { useEffect, useRef, useState } from 'react'

import { type DescribedError, describeError } from '../data/errors'

export interface PaginatedPage<T, C> {
  rows: T[]
  nextCursor: C | null
}

/** Initial failures replace the list; pagination failures preserve it for retry. */
export function usePaginatedList<T, C>({
  listKey,
  loadPage,
  beforeLoad,
}: {
  listKey: string | null
  loadPage: (cursor: C | null) => Promise<PaginatedPage<T, C>>
  beforeLoad?: () => Promise<void>
}) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState<{
    key: string | null
    attempt: number
    rows: T[]
    cursor: C | null
    error: DescribedError | null
    moreError: DescribedError | null
    loadingMore: boolean
  } | null>(null)
  const owner = useRef<{ active: boolean; busy: boolean } | null>(null)
  const current = state?.key === listKey && state?.attempt === attempt ? state : null
  const loading = listKey !== null && current === null

  // oxlint-disable-next-line react/exhaustive-deps
  useEffect(() => {
    const task = { active: true, busy: false }
    owner.current = task
    if (listKey !== null) {
      void (async () => {
        try {
          await beforeLoad?.()
          if (!task.active) return
          const page = await loadPage(null)
          if (task.active)
            setState({
              key: listKey,
              attempt,
              rows: page.rows,
              cursor: page.nextCursor,
              error: null,
              moreError: null,
              loadingMore: false,
            })
        } catch (err) {
          if (task.active)
            setState({
              key: listKey,
              attempt,
              rows: [],
              cursor: null,
              error: describeError(err),
              moreError: null,
              loadingMore: false,
            })
        }
      })()
    }
    return () => {
      task.active = false
    }
  }, [listKey, attempt])

  async function loadMore() {
    const task = owner.current
    if (!current || current.cursor === null || !task?.active || task.busy) return
    task.busy = true
    setState((prev) => prev && { ...prev, loadingMore: true, moreError: null })
    try {
      const page = await loadPage(current.cursor)
      if (task.active)
        setState(
          (prev) =>
            prev && {
              ...prev,
              rows: [...prev.rows, ...page.rows],
              cursor: page.nextCursor,
              loadingMore: false,
              moreError: null,
            },
        )
    } catch (err) {
      if (task.active)
        setState((prev) => prev && { ...prev, loadingMore: false, moreError: describeError(err) })
    } finally {
      task.busy = false
    }
  }

  return {
    rows: current?.rows ?? [],
    loading,
    loadingMore: current?.loadingMore ?? false,
    error: current?.error ?? null,
    loadMoreError: current?.moreError ?? null,
    hasMore: current?.cursor != null,
    loadMore,
    retry: () => setAttempt((value) => value + 1),
  }
}
