import { useEffect, useState } from 'react'

import { type DescribedError, describeError } from '../data/errors'

export interface PaginatedPage<T, C> {
  rows: T[]
  nextCursor: C | null
}

/**
 * Keyset-paginated list with the same stale-resolution pattern as useAsyncData.
 * `listKey` should encode every input that resets the first page.
 */
export function usePaginatedList<T, C>({
  listKey,
  loadPage,
  beforeLoad,
}: {
  listKey: string | null
  loadPage: (cursor: C | null) => Promise<PaginatedPage<T, C>>
  beforeLoad?: () => Promise<void>
}): {
  rows: T[]
  loading: boolean
  loadingMore: boolean
  error: DescribedError | null
  hasMore: boolean
  loadMore: () => Promise<void>
} {
  const [syncedKey, setSyncedKey] = useState(listKey)
  const [fetchedKey, setFetchedKey] = useState<string | null>(null)
  const [rows, setRows] = useState<T[]>([])
  const [cursor, setCursor] = useState<C | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState<DescribedError | null>(null)

  if (syncedKey !== listKey) {
    setSyncedKey(listKey)
    setError(null)
  }

  const loading = listKey !== null && fetchedKey !== listKey

  // oxlint-disable-next-line react/exhaustive-deps
  useEffect(() => {
    if (syncedKey === null) return
    let active = true
    void (async () => {
      try {
        await beforeLoad?.()
        const page = await loadPage(null)
        if (!active) return
        setRows(page.rows)
        setCursor(page.nextCursor)
        setError(null)
        setFetchedKey(syncedKey)
      } catch (err) {
        if (active) {
          setError(describeError(err))
          setFetchedKey(syncedKey)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [syncedKey])

  async function loadMore() {
    if (!cursor || loadingMore) return
    setLoadingMore(true)
    try {
      const page = await loadPage(cursor)
      setRows((prev) => [...prev, ...page.rows])
      setCursor(page.nextCursor)
    } catch (err) {
      setError(describeError(err))
    } finally {
      setLoadingMore(false)
    }
  }

  return {
    rows,
    loading,
    loadingMore,
    error,
    hasMore: cursor !== null,
    loadMore,
  }
}
