import type { FundType } from './fundType'
import type { Category } from './types'

export interface HistoryTxnItem {
  categoryId: string
  type?: FundType
  memo?: string | null
  txnDate?: string
}

export interface SuggestedCategory {
  categoryId: string
  categoryName: string
  type: FundType
  matchType: 'history' | 'name'
}

/**
 * Pure domain function to suggest categories based on memo history frequency
 * or category name matches.
 * No Supabase, no network, no LLM / quota calls.
 */
export function suggestCategoriesFromMemo(
  memo: string,
  categories: Category[],
  historyTxns: HistoryTxnItem[] = [],
  maxSuggestions = 3,
): SuggestedCategory[] {
  const trimmed = memo.trim().toLowerCase()
  if (!trimmed) return []

  const activeCategoriesMap = new Map(categories.map((c) => [c.id, c]))
  const results: SuggestedCategory[] = []
  const addedCategoryIds = new Set<string>()

  // 1. History match scores
  const categoryScores = new Map<string, { count: number; exactMatches: number }>()

  for (const item of historyTxns) {
    if (!item.memo || !item.categoryId) continue
    const itemMemo = item.memo.trim().toLowerCase()
    if (!itemMemo) continue

    const category = activeCategoriesMap.get(item.categoryId)
    if (!category) continue

    const isExact = itemMemo === trimmed
    const isSubstring = itemMemo.includes(trimmed) || trimmed.includes(itemMemo)

    if (isExact || isSubstring) {
      const existing = categoryScores.get(item.categoryId) || { count: 0, exactMatches: 0 }
      existing.count += 1
      if (isExact) existing.exactMatches += 1
      categoryScores.set(item.categoryId, existing)
    }
  }

  // Sort history matches: exact matches first, then total count descending
  const sortedHistory = Array.from(categoryScores.entries()).sort((a, b) => {
    if (b[1].exactMatches !== a[1].exactMatches) {
      return b[1].exactMatches - a[1].exactMatches
    }
    return b[1].count - a[1].count
  })

  for (const [catId] of sortedHistory) {
    if (results.length >= maxSuggestions) break
    const category = activeCategoriesMap.get(catId)
    if (category) {
      results.push({
        categoryId: category.id,
        categoryName: category.name,
        type: category.type,
        matchType: 'history',
      })
      addedCategoryIds.add(category.id)
    }
  }

  // 2. Category name match fallback/supplement
  if (results.length < maxSuggestions) {
    for (const category of categories) {
      if (results.length >= maxSuggestions) break
      if (addedCategoryIds.has(category.id)) continue

      const catName = category.name.trim().toLowerCase()
      if (!catName) continue

      if (trimmed === catName || trimmed.includes(catName) || catName.includes(trimmed)) {
        results.push({
          categoryId: category.id,
          categoryName: category.name,
          type: category.type,
          matchType: 'name',
        })
        addedCategoryIds.add(category.id)
      }
    }
  }

  return results
}
