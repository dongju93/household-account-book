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
}): {
  suggestions: SuggestedCategory[]
  loading: boolean
} {
  const [suggestions, setSuggestions] = useState<SuggestedCategory[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!enabled || !ledgerId || !memo.trim()) {
      setSuggestions([])
      setLoading(false)
      return
    }

    let cancelled = false
    setLoading(true)

    // 400ms debounce (spec §5.2)
    const timer = setTimeout(async () => {
      try {
        const history = await fetchMemoHistory(ledgerId, memo)
        if (cancelled) return
        const computed = suggestCategoriesFromMemo(memo, categories, history)
        setSuggestions(computed)
      } catch {
        if (cancelled) return
        // Fallback to name matching if history fetch fails
        const computed = suggestCategoriesFromMemo(memo, categories, [])
        setSuggestions(computed)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }, 400)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [ledgerId, memo, categories, enabled])

  return { suggestions, loading }
}
