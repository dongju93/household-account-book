import { useEffect, useState } from 'react'
import type { DependencyList } from 'react'
import { describeError, type DescribedError } from '../data/errors'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: DescribedError | null
}

/**
 * Runs `loader` whenever `deps` change (and on demand via `reload`), tracking
 * loading/error so screens can render the spec §11 states uniformly. Stale
 * resolutions are ignored to avoid setting state after unmount / dep change.
 */
export function useAsyncData<T>(
  loader: () => Promise<T>,
  deps: DependencyList,
): AsyncState<T> & { reload: () => void } {
  const [state, setState] = useState<AsyncState<T>>({ data: null, loading: true, error: null })
  const [nonce, setNonce] = useState(0)

  useEffect(() => {
    let active = true
    setState((prev) => ({ ...prev, loading: true, error: null }))
    loader().then(
      (data) => {
        if (active) setState({ data, loading: false, error: null })
      },
      (err) => {
        if (active) setState({ data: null, loading: false, error: describeError(err) })
      },
    )
    return () => {
      active = false
    }
    // loader identity is intentionally excluded; the explicit deps drive reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce])

  return { ...state, reload: () => setNonce((n) => n + 1) }
}
