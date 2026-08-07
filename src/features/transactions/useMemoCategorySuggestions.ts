import { useEffect, useState } from 'react'

import { fetchMemoHistory } from '../../data/transactions'
import {
  suggestCategoriesFromMemo,
  type SuggestedCategory,
} from '../../domain/memoCategorySuggestions'
import type { Category } from '../../domain/types'

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
  const [suggestions, setSuggestions] = useState<SuggestedCategory[]>([])

  useEffect(() => {
    if (!enabled || !ledgerId || !memo.trim()) {
      setSuggestions([])
      return
    }

    let cancelled = false

    // 400ms debounce (spec §5.2)
    const timer = setTimeout(async () => {
      try {
        const history = await fetchMemoHistory(ledgerId, memo)
        if (cancelled) return
        setSuggestions(suggestCategoriesFromMemo(memo, categories, history))
      } catch {
        if (cancelled) return
        // Fallback to name matching if history fetch fails
        setSuggestions(suggestCategoriesFromMemo(memo, categories, []))
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ledgerId, memo, categories, enabled])

  return { suggestions }
}
