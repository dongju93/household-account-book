import { describe, expect, it } from 'vite-plus/test'

import {
  type NlCategoryRef,
  normalizeNlAmount,
  normalizeNlMemo,
  normalizeNlTxnDraft,
  resolveNlCategory,
} from './nlTxnDraft'

const cats: NlCategoryRef[] = [
  { id: 'food', name: '식비', type: 'expense' },
  { id: 'cafe', name: '카페', type: 'expense' },
  { id: 'salary', name: '월급', type: 'income' },
  { id: 'emer', name: '비상금', type: 'saving' },
  { id: 'coffee-shop', name: '커피숍', type: 'expense' },
  { id: 'coffee-bean', name: '커피빈', type: 'expense' },
]

describe('resolveNlCategory', () => {
  it('returns empty warnings when name is null or blank', () => {
    expect(resolveNlCategory(cats, null, 'expense')).toEqual({ warnings: [] })
    expect(resolveNlCategory(cats, '   ', 'expense')).toEqual({ warnings: [] })
  })

  it('exact match (trim, case-insensitive)', () => {
    expect(resolveNlCategory(cats, ' 식비 ', 'expense')).toEqual({ categoryId: 'food' })
    expect(resolveNlCategory(cats, '식비', null)).toEqual({ categoryId: 'food' })
  })

  it('unique substring match when no exact hit', () => {
    // "비상" is a contiguous substring of "비상금" only
    expect(resolveNlCategory(cats, '비상', 'saving')).toEqual({ categoryId: 'emer' })
  })

  it('0 matches → warning, no categoryId', () => {
    const result = resolveNlCategory(cats, '존재하지않음', 'expense')
    expect(result).toEqual({
      warnings: ['일치하는 카테고리를 찾지 못했습니다. 직접 선택해 주세요.'],
    })
  })

  it('many substring matches → warning, no categoryId', () => {
    // "커피" matches both 커피숍 and 커피빈
    const result = resolveNlCategory(cats, '커피', 'expense')
    expect(result).toEqual({
      warnings: ['카테고리가 여러 개 일치합니다. 직접 선택해 주세요.'],
    })
  })

  it('type mismatch → dedicated warning', () => {
    const result = resolveNlCategory(cats, '식비', 'income')
    expect(result).toEqual({
      warnings: ['카테고리 구분이 거래 구분과 일치하지 않습니다.'],
    })
  })

  it('type filter: unique name of wrong type is not accepted as substring of another type', () => {
    // 월급 is income-only; expense pool has no match
    expect(resolveNlCategory(cats, '월급', 'expense')).toEqual({
      warnings: ['카테고리 구분이 거래 구분과 일치하지 않습니다.'],
    })
  })
})

describe('normalizeNlAmount', () => {
  it('accepts positive integers only', () => {
    expect(normalizeNlAmount(4500)).toEqual({ amount: 4500 })
    expect(normalizeNlAmount(1)).toEqual({ amount: 1 })
  })

  it('null/undefined stay null without warning', () => {
    expect(normalizeNlAmount(null)).toEqual({ amount: null })
    expect(normalizeNlAmount(undefined)).toEqual({ amount: null })
  })

  it('non-integer number → null + warning (no silent trunc)', () => {
    expect(normalizeNlAmount(4500.5)).toEqual({
      amount: null,
      warning: '금액은 0보다 큰 정수여야 합니다.',
    })
  })

  it('zero, negative, non-number → null + warning', () => {
    expect(normalizeNlAmount(0).amount).toBeNull()
    expect(normalizeNlAmount(-1).amount).toBeNull()
    expect(normalizeNlAmount('4500').amount).toBeNull()
    expect(normalizeNlAmount('1만2천원').amount).toBeNull()
    expect(normalizeNlAmount(NaN).warning).toBeDefined()
  })
})

describe('normalizeNlMemo', () => {
  it('trims and maps empty to null', () => {
    expect(normalizeNlMemo('  스타벅스  ')).toEqual({ memo: '스타벅스' })
    expect(normalizeNlMemo('   ')).toEqual({ memo: null })
    expect(normalizeNlMemo(null)).toEqual({ memo: null })
  })

  it('truncates over 200 chars with warning', () => {
    const long = '가'.repeat(201)
    const result = normalizeNlMemo(long)
    expect(result.memo).toHaveLength(200)
    expect(result.warning).toBe('메모는 200자까지 저장됩니다.')
  })
})

describe('normalizeNlTxnDraft', () => {
  it('combines amount, category, memo and type prefill', () => {
    const draft = normalizeNlTxnDraft(
      {
        amount: 4500,
        type: 'expense',
        categoryName: '식비',
        date: '2026-07-11',
        memo: ' 점심 ',
      },
      cats,
    )
    expect(draft).toEqual({
      amount: 4500,
      type: 'expense',
      categoryId: 'food',
      categoryName: '식비',
      date: '2026-07-11',
      memo: '점심',
      warnings: [],
    })
  })

  it('fills type from resolved category when model omitted type', () => {
    const draft = normalizeNlTxnDraft(
      {
        amount: 1000,
        type: null,
        categoryName: '월급',
        date: null,
        memo: null,
      },
      cats,
    )
    expect(draft.type).toBe('income')
    expect(draft.categoryId).toBe('salary')
    expect(draft.warnings).toEqual([])
  })

  it('collects field warnings without guessing amount or category', () => {
    const draft = normalizeNlTxnDraft(
      {
        amount: 12.5,
        type: 'expense',
        categoryName: '커피',
        date: '어제',
        memo: null,
      },
      cats,
    )
    expect(draft.amount).toBeNull()
    expect(draft.categoryId).toBeNull()
    expect(draft.date).toBeNull()
    expect(draft.warnings).toEqual([
      '금액은 0보다 큰 정수여야 합니다.',
      '카테고리가 여러 개 일치합니다. 직접 선택해 주세요.',
      '날짜 형식이 올바르지 않습니다.',
    ])
  })
})
