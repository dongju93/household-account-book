import { describe, expect, it } from 'vite-plus/test'

import { suggestCategoriesFromMemo } from './memoCategorySuggestions'
import type { Category } from './types'

const CATEGORIES: Category[] = [
  {
    id: 'c-food',
    ledgerId: 'leg-1',
    name: '식비',
    type: 'expense',
    icon: null,
    budgetAmount: null,
    goalAmount: null,
    sortOrder: 0,
    isActive: true,
    showBudgetPace: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-cafe',
    ledgerId: 'leg-1',
    name: '카페/디저트',
    type: 'expense',
    icon: null,
    budgetAmount: null,
    goalAmount: null,
    sortOrder: 1,
    isActive: true,
    showBudgetPace: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
  {
    id: 'c-salary',
    ledgerId: 'leg-1',
    name: '월급',
    type: 'income',
    icon: null,
    budgetAmount: null,
    goalAmount: null,
    sortOrder: 2,
    isActive: true,
    showBudgetPace: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

describe('suggestCategoriesFromMemo', () => {
  it('returns empty array for blank or whitespace memo', () => {
    expect(suggestCategoriesFromMemo('', CATEGORIES)).toEqual([])
    expect(suggestCategoriesFromMemo('   ', CATEGORIES)).toEqual([])
  })

  it('suggests categories based on history frequency and exact matches', () => {
    const history = [
      { categoryId: 'c-cafe', memo: '스타벅스 강남점' },
      { categoryId: 'c-food', memo: '스타벅스' },
      { categoryId: 'c-food', memo: '스타벅스' },
    ]

    const suggestions = suggestCategoriesFromMemo('스타벅스', CATEGORIES, history)
    expect(suggestions).toEqual([
      { categoryId: 'c-food', categoryName: '식비', type: 'expense', matchType: 'history' },
      { categoryId: 'c-cafe', categoryName: '카페/디저트', type: 'expense', matchType: 'history' },
    ])
  })

  it('survives a memo that refines a previously saved shorter memo (new contains stored)', () => {
    // User types the longer "스타벅스 강남점"; older rows saved as just "스타벅스"
    // must still contribute their category. The data layer (search_memo_history)
    // is what surfaces these rows; this pins the domain half of the contract.
    const history = [
      { categoryId: 'c-food', memo: '스타벅스' },
      { categoryId: 'c-food', memo: '스타벅스' },
      { categoryId: 'c-cafe', memo: '스타벅스 강남점' },
    ]

    const suggestions = suggestCategoriesFromMemo('스타벅스 강남점', CATEGORIES, history)
    // exact match (c-cafe, "스타벅스 강남점") outranks the higher-count
    // substring-only c-food entries.
    expect(suggestions).toEqual([
      { categoryId: 'c-cafe', categoryName: '카페/디저트', type: 'expense', matchType: 'history' },
      { categoryId: 'c-food', categoryName: '식비', type: 'expense', matchType: 'history' },
    ])
  })

  it('falls back to category name matching when history has no matches', () => {
    const suggestions = suggestCategoriesFromMemo('이번달 월급 입금', CATEGORIES, [])
    expect(suggestions).toEqual([
      { categoryId: 'c-salary', categoryName: '월급', type: 'income', matchType: 'name' },
    ])
  })

  it('ignores inactive category IDs in history', () => {
    const history = [{ categoryId: 'c-deleted', memo: '스타벅스' }]
    const suggestions = suggestCategoriesFromMemo('스타벅스', CATEGORIES, history)
    expect(suggestions).toEqual([])
  })

  it('still matches a single-character memo exactly', () => {
    const history = [{ categoryId: 'c-food', memo: '밥' }]
    const suggestions = suggestCategoriesFromMemo('밥', CATEGORIES, history)
    expect(suggestions).toEqual([
      { categoryId: 'c-food', categoryName: '식비', type: 'expense', matchType: 'history' },
    ])
  })

  it('does not substring-match single-character memos against longer text', () => {
    const history = [{ categoryId: 'c-food', memo: '밥' }]
    const suggestions = suggestCategoriesFromMemo('동네 밥상에서 점심', CATEGORIES, history)
    expect(suggestions).toEqual([])
  })

  it('limits suggestions to maxSuggestions (default 3)', () => {
    const cats: Category[] = Array.from({ length: 5 }, (_, i) => ({
      id: `c-${i}`,
      ledgerId: 'leg-1',
      name: `카테고리${i}`,
      type: 'expense',
      icon: null,
      budgetAmount: null,
      goalAmount: null,
      sortOrder: i,
      isActive: true,
      showBudgetPace: false,
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    }))

    const history = cats.map((c) => ({ categoryId: c.id, memo: '테스트' }))
    const suggestions = suggestCategoriesFromMemo('테스트', cats, history, 2)
    expect(suggestions).toHaveLength(2)
  })
})
