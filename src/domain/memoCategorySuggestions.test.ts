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
