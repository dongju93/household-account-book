import { useEffect, useState } from 'react'

import { fetchMemoHistory } from '../../data/transactions'
import {
  suggestCategoriesFromMemo,
  type SuggestedCategory,
} from '../../domain/memoCategorySuggestions'
import type { Category } from '../../domain/types'

const NO_SUGGESTIONS: SuggestedCategory[] = []

/** A resolved result, tagged with the query it describes. */
type Resolved = {
  ledgerId: string
  memo: string
  suggestions: SuggestedCategory[]
}

export function useMemoCategorySuggestions({
  ledgerId,
  memo,
  categories,
  enabled = true,
}: {
  ledgerId: string
  memo: string
  categories: Category[]
  enabled?: boolean
}): { suggestions: SuggestedCategory[] } {
  const [resolved, setResolved] = useState<Resolved | null>(null)

  useEffect(() => {
    if (!enabled || !ledgerId || !memo.trim()) {
      setResolved(null)
      return
    }

    let cancelled = false

    // 400ms debounce (spec §5.2)
    const timer = setTimeout(async () => {
      try {
        const history = await fetchMemoHistory(ledgerId, memo)
        if (cancelled) return
        setResolved({
          ledgerId,
          memo,
          suggestions: suggestCategoriesFromMemo(memo, categories, history),
        })
      } catch {
        if (cancelled) return
        // Fallback to name matching if history fetch fails
        setResolved({
          ledgerId,
          memo,
          suggestions: suggestCategoriesFromMemo(memo, categories, []),
        })
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ledgerId, memo, categories, enabled])

  // Suggestions describe a specific memo, so they are only shown while that memo
  // is still the one in the form. Typing over a memo therefore hides the chips
  // immediately — through the debounce and the in-flight fetch — instead of
  // leaving the previous memo's categories clickable against a new transaction.
  // Deriving this (rather than clearing state in the effect) also avoids the
  // frame of stale chips that a post-paint effect would allow.
  const fresh =
    enabled && resolved !== null && resolved.ledgerId === ledgerId && resolved.memo === memo

  return { suggestions: fresh ? resolved.suggestions : NO_SUGGESTIONS }
}
