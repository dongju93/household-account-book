import type { DependencyList } from 'react'
import { useEffect, useState } from 'react'
import { type DescribedError, describeError } from '../data/errors'

export interface AsyncState<T> {
  data: T | null
  loading: boolean
  error: DescribedError | null
}

function triggersEqual(a: unknown[], b: unknown[]): boolean {
  return a.length === b.length && a.every((v, i) => v === b[i])
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
  const [nonce, setNonce] = useState(0)
  const trigger = [...deps, nonce]

  const [snapshot, setSnapshot] = useState({ trigger, gen: 0 })
  if (!triggersEqual(snapshot.trigger, trigger)) {
    setSnapshot({ trigger, gen: snapshot.gen + 1 })
  }

  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState<DescribedError | null>(null)
  const [resolvedGen, setResolvedGen] = useState(-1)
  const loading = resolvedGen < snapshot.gen

  // biome-ignore lint/correctness/useExhaustiveDependencies: explicit trigger drives reloads
  useEffect(() => {
    let active = true
    const gen = snapshot.gen
    loader().then(
      (result) => {
        if (!active) return
        setData(result)
        setError(null)
        setResolvedGen(gen)
      },
      (err) => {
        if (!active) return
        setData(null)
        setError(describeError(err))
        setResolvedGen(gen)
      },
    )
    return () => {
      active = false
    }
  }, [snapshot.gen])

  return { data, loading, error, reload: () => setNonce((n) => n + 1) }
}
