import { useRef } from 'react'

import { materializeMonth } from '../data/summary'
import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'

/**
 * Ensures recurring items are materialized once per (month, refresh version).
 * Returns an idempotent `ensure` function screens call before reads/exports.
 */
export function useMaterializedMonth(
  ledgerId: string | null,
  ym: YearMonth,
  version: number,
): () => Promise<void> {
  const materializedRef = useRef<string | null>(null)

  return async () => {
    if (!ledgerId) return
    const matKey = `${monthKey(ym.year, ym.month)}:${version}`
    if (materializedRef.current === matKey) return
    await materializeMonth(ledgerId, ym)
    materializedRef.current = matKey
  }
}
