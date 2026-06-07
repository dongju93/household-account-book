import { describe, expect, it } from 'vite-plus/test'

import { computeAchievements, expenseStatus, pctOf, savingStatus } from './achievement'
import type { CategoryLike, TxnLike } from './types'

describe('pctOf (divide-by-zero guard)', () => {
  it('returns 0 when target is 0 or negative', () => {
    expect(pctOf(5000, 0)).toBe(0)
    expect(pctOf(0, 0)).toBe(0)
    expect(pctOf(100, -10)).toBe(0)
  })

  it('rounds the ratio to a whole percent', () => {
    expect(pctOf(430_000, 500_000)).toBe(86)
    expect(pctOf(1, 3)).toBe(33)
  })
})

describe('expenseStatus boundaries', () => {
  it('초과 strictly above budget', () => {
    expect(expenseStatus(500_001, 500_000)).toBe('초과')
  })
  it('주의 at exactly budget (100% ≥ 90%, but not over)', () => {
    expect(expenseStatus(500_000, 500_000)).toBe('주의')
  })
  it('주의 at exactly 90% of budget', () => {
    expect(expenseStatus(450_000, 500_000)).toBe('주의')
  })
  it('정상 just below 90%', () => {
    expect(expenseStatus(449_999, 500_000)).toBe('정상')
  })
  it('정상 (not 주의) when budget is 0 and nothing spent', () => {
    expect(expenseStatus(0, 0)).toBe('정상')
  })
  it('초과 when budget is 0 but something spent', () => {
    expect(expenseStatus(1, 0)).toBe('초과')
  })
})

describe('savingStatus boundaries', () => {
  it('달성 at or above goal', () => {
    expect(savingStatus(500_000, 500_000)).toBe('달성')
    expect(savingStatus(600_000, 500_000)).toBe('달성')
  })
  it('근접 at exactly 90% of goal', () => {
    expect(savingStatus(450_000, 500_000)).toBe('근접')
  })
  it('진행중 just below 90%', () => {
    expect(savingStatus(449_999, 500_000)).toBe('진행중')
  })
  it('진행중 (not 달성) when goal is 0', () => {
    expect(savingStatus(0, 0)).toBe('진행중')
    expect(savingStatus(10_000, 0)).toBe('진행중')
  })
})

describe('computeAchievements', () => {
  const cats: CategoryLike[] = [
    { id: 'food', name: '식비', type: 'expense', budgetAmount: 500_000, goalAmount: null },
    { id: 'bus', name: '교통', type: 'expense', budgetAmount: 200_000, goalAmount: null },
    { id: 'emer', name: '비상금', type: 'saving', budgetAmount: null, goalAmount: 500_000 },
    { id: 'salary', name: '월급', type: 'income', budgetAmount: null, goalAmount: null },
    { id: 'stock', name: '주식', type: 'investment', budgetAmount: null, goalAmount: null },
  ]
  const txns: TxnLike[] = [
    { type: 'expense', amount: 430_000, categoryId: 'food' },
    { type: 'expense', amount: 84_000, categoryId: 'bus' },
    { type: 'saving', amount: 350_000, categoryId: 'emer' },
    { type: 'income', amount: 3_200_000, categoryId: 'salary' },
    { type: 'investment', amount: 100_000, categoryId: 'stock' },
  ]

  it('includes only 지출 and 저축 categories (excludes 수입/투자)', () => {
    const rows = computeAchievements(cats, txns)
    expect(rows.map((r) => r.categoryId).sort()).toEqual(['bus', 'emer', 'food'])
  })

  it('computes target, actual, remaining, pct and status per row', () => {
    const rows = computeAchievements(cats, txns)
    const food = rows.find((r) => r.categoryId === 'food')!
    expect(food).toMatchObject({
      type: 'expense',
      target: 500_000,
      actual: 430_000,
      remaining: 70_000,
      pct: 86, // 86% < 90% → 정상 per spec §6.3 (wireframe's "주의" label is illustrative)
      status: '정상',
    })
    const emer = rows.find((r) => r.categoryId === 'emer')!
    expect(emer).toMatchObject({
      type: 'saving',
      target: 500_000,
      actual: 350_000,
      remaining: 150_000,
      pct: 70,
      status: '진행중',
    })
  })

  it('treats a category with no transactions as 0 actual', () => {
    const rows = computeAchievements(
      [{ id: 'x', name: '의료', type: 'expense', budgetAmount: 100_000, goalAmount: null }],
      [],
    )
    expect(rows[0]).toMatchObject({ actual: 0, remaining: 100_000, pct: 0, status: '정상' })
  })
})
