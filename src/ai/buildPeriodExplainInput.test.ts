import { describe, expect, it } from 'vitest'

import type { CategoryBreakdownRow, MonthlyTrendPoint } from '../domain/reports'
import { buildPeriodExplainInput } from './buildPeriodExplainInput'

describe('buildPeriodExplainInput', () => {
  const mockTrend: MonthlyTrendPoint[] = [
    {
      month: '2026-03',
      totalIncome: 3000000,
      totalExpense: 1500000,
      totalSaving: 500000,
      totalInvestment: 300000,
      balance: 700000,
    },
    {
      month: '2026-04',
      totalIncome: 3200000,
      totalExpense: 1600000,
      totalSaving: 600000,
      totalInvestment: 300000,
      balance: 700000,
    },
    {
      month: '2026-05',
      totalIncome: 3100000,
      totalExpense: 1400000,
      totalSaving: 500000,
      totalInvestment: 300000,
      balance: 900000,
    },
  ]

  const mockBreakdown: CategoryBreakdownRow[] = [
    { categoryId: 'cat-1', name: '식비', amount: 800000, pct: 50 },
    { categoryId: 'cat-2', name: '주거', amount: 400000, pct: 25 },
    { categoryId: 'cat-3', name: '교통', amount: 200000, pct: 12.5 },
    { categoryId: 'cat-4', name: '통신', amount: 100000, pct: 6.25 },
    { categoryId: 'cat-5', name: '문화', amount: 50000, pct: 3.125 },
    { categoryId: 'cat-6', name: '기타', amount: 50000, pct: 3.125 },
  ]

  it('builds periodKey and maps aggregate trend points correctly', () => {
    const input = buildPeriodExplainInput({
      period: 3,
      trend: mockTrend,
      breakdown: mockBreakdown,
    })

    expect(input.periodKey).toBe('3m:2026-03_2026-05')
    expect(input.periodKey.length).toBeLessThanOrEqual(32)
    expect(input.months).toHaveLength(3)
    expect(input.months[0]).toEqual({
      month: '2026-03',
      income: 3000000,
      expense: 1500000,
      saving: 500000,
      investment: 300000,
      balance: 700000,
    })
  })

  it('caps topCategories to at most 5 items and strips categoryId', () => {
    const input = buildPeriodExplainInput({
      period: 6,
      trend: mockTrend,
      breakdown: mockBreakdown,
    })

    expect(input.topCategories).toHaveLength(5)
    expect(input.topCategories).toEqual([
      { name: '식비', amount: 800000, pct: 50 },
      { name: '주거', amount: 400000, pct: 25 },
      { name: '교통', amount: 200000, pct: 12.5 },
      { name: '통신', amount: 100000, pct: 6.25 },
      { name: '문화', amount: 50000, pct: 3.125 },
    ])
    // Ensure categoryId is not exposed
    expect(input.topCategories?.[0]).not.toHaveProperty('categoryId')
  })

  it('caps trend to at most 12 months', () => {
    const longTrend: MonthlyTrendPoint[] = Array.from({ length: 15 }, (_, i) => {
      const monthNum = (i + 1).toString().padStart(2, '0')
      return {
        month: `2025-${monthNum}`,
        totalIncome: 100000,
        totalExpense: 50000,
        totalSaving: 20000,
        totalInvestment: 10000,
        balance: 20000,
      }
    })

    const input = buildPeriodExplainInput({
      period: 12,
      trend: longTrend,
      breakdown: [],
    })

    expect(input.months).toHaveLength(12)
    expect(input.months[0].month).toBe('2025-04')
    expect(input.months[11].month).toBe('2025-15')
    expect(input.periodKey).toBe('12m:2025-04_2025-15')
    expect(input.periodKey.length).toBeLessThanOrEqual(32)
  })
})
