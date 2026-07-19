import { describe, expect, it } from 'vite-plus/test'

import type { AchievementRow } from '../domain/achievement'
import type { BudgetPaceRowWithStatus } from '../domain/budgetPace'
import type { CategoryBreakdownRow } from '../domain/reports'
import { buildMonthInsightInput } from './buildMonthInsightInput'
import { AI_LIMITS } from './types'

const YM = { year: 2026, month: 7 }

const SUMMARY = {
  totalIncome: 3_000_000,
  totalExpense: 1_200_000,
  totalSaving: 500_000,
  totalInvestment: 300_000,
  balance: 1_000_000,
}

function achievement(i: number): AchievementRow {
  return {
    categoryId: `cat-${i}`,
    name: `카테고리${i}`,
    type: 'expense',
    target: 100_000,
    actual: 50_000,
    remaining: 50_000,
    pct: 50,
    status: '정상',
  }
}

function paceRow(i: number): BudgetPaceRowWithStatus {
  return {
    categoryId: `cat-${i}`,
    name: `카테고리${i}`,
    budget: 100_000,
    actual: 50_000,
    remainingBudget: 50_000,
    daysRemaining: 10,
    dailyAllowance: 5_000,
    status: '정상',
  }
}

function breakdownRow(i: number): CategoryBreakdownRow {
  return { categoryId: `cat-${i}`, name: `카테고리${i}`, amount: 10_000 * (9 - i), pct: 10 }
}

describe('buildMonthInsightInput (S06 / PR-6)', () => {
  it('maps aggregates with whitelisted fields only — no ids, no raw transactions', () => {
    const input = buildMonthInsightInput({
      ym: YM,
      summary: SUMMARY,
      achievements: [achievement(1)],
      paceRows: [paceRow(1)],
      breakdown: [breakdownRow(1)],
    })

    expect(input.month).toBe('2026-07')
    expect(Object.keys(input).sort()).toEqual([
      'achievements',
      'month',
      'pace',
      'summary',
      'topExpenses',
    ])
    expect(input.summary).toEqual(SUMMARY)
    expect(input.achievements[0]).toEqual({
      name: '카테고리1',
      type: 'expense',
      target: 100_000,
      actual: 50_000,
      status: '정상',
    })
    expect(input.pace?.[0]).toEqual({
      name: '카테고리1',
      remainingBudget: 50_000,
      daysRemaining: 10,
      dailyAllowance: 5_000,
      status: '정상',
    })
    expect(input.topExpenses[0]).toEqual({ name: '카테고리1', amount: 80_000, pct: 10 })
    // categoryId must never leak into the Edge payload
    expect(JSON.stringify(input)).not.toContain('cat-1')
  })

  it('omits pace entirely when paceRows is not provided (past months)', () => {
    const input = buildMonthInsightInput({
      ym: YM,
      summary: SUMMARY,
      achievements: [],
      breakdown: [],
    })
    expect('pace' in input).toBe(false)
  })

  it('caps achievements, pace, and topExpenses at AI_LIMITS.monthInsight', () => {
    const many = (n: number) => Array.from({ length: n }, (_, i) => i)
    const input = buildMonthInsightInput({
      ym: YM,
      summary: SUMMARY,
      achievements: many(50).map(achievement),
      paceRows: many(50).map(paceRow),
      breakdown: many(9).map(breakdownRow),
    })
    expect(input.achievements).toHaveLength(AI_LIMITS.monthInsight.achievementsMax)
    expect(input.pace).toHaveLength(AI_LIMITS.monthInsight.paceMax)
    expect(input.topExpenses).toHaveLength(AI_LIMITS.monthInsight.topExpensesMax)
  })
})
