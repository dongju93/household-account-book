import { describe, expect, it } from 'vite-plus/test'

import { computeMonthSummary } from './monthSummary'
import { categoryExpenseBreakdown, monthlyCategoryStacks, monthlyTrend } from './reports'
import type { CategoryLike, TxnLike } from './types'

const fixture: TxnLike[] = [
  { type: 'income', amount: 3_200_000, categoryId: 'salary' },
  { type: 'expense', amount: 430_000, categoryId: 'food' },
  { type: 'expense', amount: 84_000, categoryId: 'bus' },
  { type: 'saving', amount: 600_000, categoryId: 'emer' },
  { type: 'investment', amount: 100_000, categoryId: 'stock' },
]

describe('monthlyTrend', () => {
  it('produces a sorted point per month', () => {
    const byMonth = new Map<string, TxnLike[]>([
      ['2026-06', fixture],
      ['2026-05', [{ type: 'expense', amount: 1000, categoryId: 'food' }]],
    ])
    const trend = monthlyTrend(byMonth)
    expect(trend.map((p) => p.month)).toEqual(['2026-05', '2026-06'])
  })

  it('uses the SAME aggregation as the dashboard (spec §8)', () => {
    const byMonth = new Map<string, TxnLike[]>([['2026-06', fixture]])
    const [point] = monthlyTrend(byMonth)
    const dashboard = computeMonthSummary(fixture)
    const { month, ...summaryPart } = point
    expect(month).toBe('2026-06')
    expect(summaryPart).toEqual(dashboard)
  })
})

describe('categoryExpenseBreakdown', () => {
  const cats: CategoryLike[] = [
    { id: 'food', name: '식비', type: 'expense', budgetAmount: 500_000, goalAmount: null },
    { id: 'bus', name: '교통', type: 'expense', budgetAmount: 200_000, goalAmount: null },
    { id: 'emer', name: '비상금', type: 'saving', budgetAmount: null, goalAmount: 500_000 },
  ]

  it('groups expense-only, sorts desc, and computes share of total', () => {
    const rows = categoryExpenseBreakdown(cats, fixture)
    expect(rows.map((r) => r.categoryId)).toEqual(['food', 'bus'])
    expect(rows[0]).toMatchObject({ name: '식비', amount: 430_000, pct: 84 })
    expect(rows[1]).toMatchObject({ name: '교통', amount: 84_000, pct: 16 })
  })

  it('returns an empty array (no divide-by-zero) when there is no expense', () => {
    expect(
      categoryExpenseBreakdown(cats, [{ type: 'income', amount: 100, categoryId: 'salary' }]),
    ).toEqual([])
  })
})

describe('monthlyCategoryStacks', () => {
  const cats: CategoryLike[] = [
    { id: 'food', name: '식비', type: 'expense', budgetAmount: 500_000, goalAmount: null },
    { id: 'bus', name: '교통', type: 'expense', budgetAmount: 200_000, goalAmount: null },
    { id: 'shop', name: '쇼핑', type: 'expense', budgetAmount: 300_000, goalAmount: null },
  ]

  it('stacks top categories per month and rolls the rest into 기타', () => {
    const byMonth = new Map<string, TxnLike[]>([
      [
        '2026-05',
        [
          { type: 'expense', amount: 100, categoryId: 'food' },
          { type: 'expense', amount: 50, categoryId: 'shop' },
        ],
      ],
      [
        '2026-06',
        [
          { type: 'expense', amount: 430_000, categoryId: 'food' },
          { type: 'expense', amount: 84_000, categoryId: 'bus' },
          { type: 'expense', amount: 20_000, categoryId: 'shop' },
        ],
      ],
    ])
    const { points, series } = monthlyCategoryStacks(cats, byMonth, 2)
    expect(series.map((s) => s.key)).toEqual(['식비', '교통', '기타'])
    expect(points).toHaveLength(2)
    expect(points[0]).toMatchObject({ label: '5월', 식비: 100, 교통: 0, 기타: 50 })
    expect(points[1]).toMatchObject({ label: '6월', 식비: 430_000, 교통: 84_000, 기타: 20_000 })
  })
})
