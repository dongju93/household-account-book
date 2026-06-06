import { describe, expect, it } from 'vitest'
import { FUND_TYPES } from './fundType'
import type { CategoryLike } from './types'
import {
  normalizeAmount,
  normalizeNonNegative,
  typeMatches,
  validateCategoryInput,
  validateRecurringInput,
  validateTransactionInput,
} from './validation'

const cat = (over: Partial<CategoryLike> = {}): CategoryLike => ({
  id: 'food',
  name: '식비',
  type: 'expense',
  budgetAmount: 500_000,
  goalAmount: null,
  ...over,
})

describe('typeMatches across every (txn × category) pair', () => {
  for (const a of FUND_TYPES) {
    for (const b of FUND_TYPES) {
      it(`${a} vs ${b} -> ${a === b}`, () => {
        expect(typeMatches(a, b)).toBe(a === b)
      })
    }
  }
})

describe('normalizeAmount', () => {
  it('accepts positive integers and strips grouping/₩', () => {
    expect(normalizeAmount('9,000')).toBe(9000)
    expect(normalizeAmount('₩ 1,250')).toBe(1250)
    expect(normalizeAmount(4500)).toBe(4500)
  })
  it('truncates decimals to integer', () => {
    expect(normalizeAmount('9000.9')).toBe(9000)
    expect(normalizeAmount(120.7)).toBe(120)
  })
  it('rejects zero, negatives, blank and non-numeric', () => {
    expect(normalizeAmount(0)).toBeNull()
    expect(normalizeAmount(-1)).toBeNull()
    expect(normalizeAmount('')).toBeNull()
    expect(normalizeAmount('abc')).toBeNull()
    expect(normalizeAmount(null)).toBeNull()
  })
  it('normalizeNonNegative allows 0 but still rejects negatives', () => {
    expect(normalizeNonNegative(0)).toBe(0)
    expect(normalizeNonNegative('0')).toBe(0)
    expect(normalizeNonNegative(-5)).toBeNull()
  })
})

describe('validateTransactionInput', () => {
  it('passes a valid manual expense and normalizes amount + memo', () => {
    const r = validateTransactionInput(
      { amount: '9,000', date: '2026-06-06', categoryId: 'food', type: 'expense', memo: '  점심 ' },
      cat(),
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ amount: 9000, memo: '점심', categoryId: 'food' })
  })

  it('rejects when the category type differs from the transaction type', () => {
    const r = validateTransactionInput(
      { amount: 1000, date: '2026-06-06', categoryId: 'food', type: 'income' },
      cat({ type: 'expense' }),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.categoryId).toBeTruthy()
  })

  it('collects missing amount / date / category errors', () => {
    const r = validateTransactionInput(
      { amount: 0, date: '', categoryId: null, type: 'expense' },
      null,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.amount).toBeTruthy()
      expect(r.errors.date).toBeTruthy()
      expect(r.errors.categoryId).toBeTruthy()
    }
  })
})

describe('validateCategoryInput budget/goal gating', () => {
  it('allows a budget only on 지출', () => {
    expect(validateCategoryInput({ name: '식비', type: 'expense', budgetAmount: '500,000' }).ok).toBe(true)
    const bad = validateCategoryInput({ name: '월급', type: 'income', budgetAmount: 100 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.budgetAmount).toBeTruthy()
  })

  it('allows a goal only on 저축', () => {
    expect(validateCategoryInput({ name: '비상금', type: 'saving', goalAmount: 500_000 }).ok).toBe(true)
    const bad = validateCategoryInput({ name: '주식', type: 'investment', goalAmount: 100 })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.errors.goalAmount).toBeTruthy()
  })

  it('requires a non-empty name', () => {
    const r = validateCategoryInput({ name: '   ', type: 'expense' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.name).toBeTruthy()
  })
})

describe('validateRecurringInput', () => {
  const savingCat = cat({ id: 's', type: 'saving', budgetAmount: null, goalAmount: 0 })

  it('passes a valid recurring saving item', () => {
    const r = validateRecurringInput(
      {
        name: '청약저축',
        type: 'saving',
        categoryId: 's',
        amount: '100,000',
        startMonth: '2026-01',
        endMonth: null,
        dayOfMonth: 25,
      },
      savingCat,
    )
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value).toMatchObject({ amount: 100_000, dayOfMonth: 25, endMonth: null })
  })

  it('rejects an end month earlier than the start month', () => {
    const r = validateRecurringInput(
      { name: 'x', type: 'saving', categoryId: 's', amount: 1000, startMonth: '2026-06', endMonth: '2026-01', dayOfMonth: 1 },
      savingCat,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errors.endMonth).toBeTruthy()
  })

  it('rejects a day_of_month outside 1..31 and a type mismatch', () => {
    const r = validateRecurringInput(
      { name: 'x', type: 'income', categoryId: 's', amount: 1000, startMonth: '2026-06', dayOfMonth: 32 },
      savingCat,
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errors.dayOfMonth).toBeTruthy()
      expect(r.errors.categoryId).toBeTruthy()
    }
  })
})
