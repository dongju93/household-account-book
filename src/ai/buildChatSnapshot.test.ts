import { describe, expect, it } from 'vitest'

import type { AchievementRow } from '../domain/achievement'
import type { CategoryBreakdownRow, CategoryDeltaRow, MonthlyTrendPoint } from '../domain/reports'
import {
  buildChatSnapshot,
  chatSnapshotBytes,
  fitChatSnapshot,
  type ChatSnapshotSources,
} from './buildChatSnapshot'
import { AI_LIMITS } from './types'

const CAPS = AI_LIMITS.chatTurn

function point(month: string, expense: number): MonthlyTrendPoint {
  return {
    month,
    totalIncome: 3_000_000,
    totalExpense: expense,
    totalSaving: 300_000,
    totalInvestment: 0,
    balance: 3_000_000 - expense - 300_000,
  }
}

function breakdown(n: number, prefix = '카'): CategoryBreakdownRow[] {
  return Array.from({ length: n }, (_, i) => ({
    categoryId: `cat-${i}`,
    name: `${prefix}${i}`,
    amount: 100_000 - i * 1000,
    pct: 10,
  }))
}

function achievement(i: number, name = `카테고리${i}`): AchievementRow {
  return {
    categoryId: `cat-${i}`,
    name,
    type: 'expense',
    target: 100_000,
    actual: 50_000,
    remaining: 50_000,
    pct: 50,
    status: '정상',
  }
}

function delta(i: number, d: number): CategoryDeltaRow {
  return {
    categoryId: `cat-${i}`,
    name: `변화${i}`,
    latestAmount: 100_000 + d,
    previousAmount: 100_000,
    delta: d,
    deltaPct: Math.round(d / 1000),
  }
}

function sources(over: Partial<ChatSnapshotSources> = {}): ChatSnapshotSources {
  return {
    today: '2026-09-19',
    currentMonth: { year: 2026, month: 9 },
    trend: [point('2026-07', 1_000_000), point('2026-08', 1_500_000), point('2026-09', 400_000)],
    breakdownByMonth: new Map([
      ['2026-07', breakdown(2)],
      ['2026-08', breakdown(7, '팔')],
      ['2026-09', breakdown(1, '구')],
    ]),
    achievements: [achievement(1), achievement(2)],
    categoryChanges: [delta(1, 5_000), delta(2, -90_000), delta(3, 20_000)],
    ...over,
  }
}

describe('buildChatSnapshot', () => {
  it('whitelists aggregates only — no ids, memos, or raw rows', () => {
    const snap = buildChatSnapshot(sources())
    expect(snap).toEqual({
      today: '2026-09-19',
      currentMonth: '2026-09',
      months: [
        {
          month: '2026-07',
          income: 3_000_000,
          expense: 1_000_000,
          saving: 300_000,
          investment: 0,
          balance: 1_700_000,
          topExpenses: [
            { name: '카0', amount: 100_000, pct: 10 },
            { name: '카1', amount: 99_000, pct: 10 },
          ],
        },
        expect.objectContaining({ month: '2026-08', expense: 1_500_000 }),
        expect.objectContaining({ month: '2026-09', expense: 400_000 }),
      ],
      achievements: [
        { name: '카테고리1', type: 'expense', target: 100_000, actual: 50_000, status: '정상' },
        { name: '카테고리2', type: 'expense', target: 100_000, actual: 50_000, status: '정상' },
      ],
      categoryChanges: [
        expect.objectContaining({ name: '변화2', delta: -90_000 }),
        expect.objectContaining({ name: '변화3', delta: 20_000 }),
        expect.objectContaining({ name: '변화1', delta: 5_000 }),
      ],
      truncated: false,
    })
    expect(JSON.stringify(snap)).not.toMatch(/categoryId|cat-\d|remaining/)
  })

  it('applies the count caps (top expenses per month, months window, changes)', () => {
    const snap = buildChatSnapshot(
      sources({
        trend: [
          point('2026-05', 1),
          point('2026-06', 2),
          point('2026-07', 3),
          point('2026-08', 4),
          point('2026-09', 5),
        ],
        categoryChanges: Array.from({ length: 8 }, (_, i) => delta(i, (i + 1) * 1000)),
      }),
    )
    expect(snap.months.map((m) => m.month)).toEqual(['2026-07', '2026-08', '2026-09'])
    expect(snap.months[1].topExpenses).toHaveLength(CAPS.topExpensesMax)
    expect(snap.categoryChanges).toHaveLength(CAPS.categoryChangesMax)
    // Cap-dropped rows are reported so the model never claims completeness.
    expect(snap.truncated).toBe(true)
  })

  it('always serializes under the Edge byte cap, even with worst-case names', () => {
    const longName = '아'.repeat(40) // 40 code points × 3 bytes — the DB maximum
    const snap = buildChatSnapshot(
      sources({
        achievements: Array.from({ length: 60 }, (_, i) => achievement(i, longName)),
        breakdownByMonth: new Map([
          ['2026-07', breakdown(10, longName)],
          ['2026-08', breakdown(10, longName)],
          ['2026-09', breakdown(10, longName)],
        ]),
        categoryChanges: Array.from({ length: 5 }, (_, i) => ({
          ...delta(i, 1000),
          name: longName,
        })),
      }),
    )
    expect(chatSnapshotBytes(snap)).toBeLessThanOrEqual(CAPS.contextMaxBytes)
    expect(snap.truncated).toBe(true)
    // The current month's totals survive every shedding step.
    expect(snap.months.at(-1)?.month).toBe('2026-09')
  })
})

describe('fitChatSnapshot', () => {
  it('sheds achievements first, then changes, then top expenses, then oldest months', () => {
    const snap = buildChatSnapshot(sources())
    const full = chatSnapshotBytes(snap)

    const noAchievements = fitChatSnapshot(snap, full - 1)
    expect(noAchievements.achievements.length).toBeLessThan(snap.achievements.length)
    expect(noAchievements.categoryChanges).toEqual(snap.categoryChanges)
    expect(noAchievements.truncated).toBe(true)

    // Small enough that only the current month's bare totals fit.
    const minimal = fitChatSnapshot(snap, 260)
    expect(minimal.achievements).toEqual([])
    expect(minimal.categoryChanges).toEqual([])
    expect(minimal.months).toHaveLength(1)
    expect(minimal.months[0].month).toBe('2026-09')
    expect(minimal.months[0].topExpenses).toEqual([])
  })

  it('is a no-op when already under the cap', () => {
    const snap = buildChatSnapshot(sources())
    expect(fitChatSnapshot(snap, CAPS.contextMaxBytes)).toBe(snap)
  })
})
