import { describe, expect, it } from 'vitest'

import type { AchievementRow } from '../../domain/achievement'
import { orderAchievements } from './orderAchievements'

function row(partial: Partial<AchievementRow> & { categoryId: string }): AchievementRow {
  return {
    name: partial.categoryId,
    type: 'expense',
    target: 0,
    actual: 0,
    remaining: 0,
    pct: 0,
    status: '정상',
    ...partial,
  }
}

describe('orderAchievements', () => {
  it('promotes current-month 주의 rows that still have budget left, highest pct first', () => {
    const rows = [
      row({
        categoryId: 'normal',
        status: '정상',
        target: 100,
        actual: 10,
        remaining: 90,
        pct: 10,
      }),
      row({
        categoryId: 'warn-92',
        status: '주의',
        target: 100,
        actual: 92,
        remaining: 8,
        pct: 92,
      }),
      row({
        categoryId: 'over',
        status: '초과',
        target: 100,
        actual: 120,
        remaining: -20,
        pct: 120,
      }),
      row({
        categoryId: 'warn-96',
        status: '주의',
        target: 100,
        actual: 96,
        remaining: 4,
        pct: 96,
      }),
    ]

    expect(orderAchievements(rows, { isCurrentMonth: true }).map((r) => r.categoryId)).toEqual([
      'warn-96',
      'warn-92',
      'normal',
      'over',
    ])
  })

  it('does not promote a 주의 row with no budget left — nothing is left to adjust', () => {
    const rows = [
      row({ categoryId: 'normal', status: '정상' }),
      row({
        categoryId: 'exact',
        status: '주의',
        target: 100,
        actual: 100,
        remaining: 0,
        pct: 100,
      }),
    ]

    expect(orderAchievements(rows, { isCurrentMonth: true }).map((r) => r.categoryId)).toEqual([
      'normal',
      'exact',
    ])
  })

  it('promotes past-month 초과 rows by overshoot size, largest first', () => {
    const rows = [
      row({
        categoryId: 'over-5',
        status: '초과',
        target: 100,
        actual: 105,
        remaining: -5,
        pct: 105,
      }),
      row({ categoryId: 'warn', status: '주의', target: 100, actual: 95, remaining: 5, pct: 95 }),
      row({
        categoryId: 'over-40',
        status: '초과',
        target: 100,
        actual: 140,
        remaining: -40,
        pct: 140,
      }),
    ]

    expect(orderAchievements(rows, { isCurrentMonth: false }).map((r) => r.categoryId)).toEqual([
      'over-40',
      'over-5',
      'warn',
    ])
  })

  it('leaves saving rows out of the promoted group in both modes', () => {
    const rows = [
      row({
        categoryId: 'expense-warn',
        status: '주의',
        target: 100,
        actual: 95,
        remaining: 5,
        pct: 95,
      }),
      row({
        categoryId: 'saving',
        type: 'saving',
        status: '진행중',
        target: 100,
        actual: 10,
        remaining: 90,
        pct: 10,
      }),
    ]

    expect(orderAchievements(rows, { isCurrentMonth: true }).map((r) => r.type)).toEqual([
      'expense',
      'saving',
    ])
  })

  it('keeps every row and preserves the configured order outside the promoted group', () => {
    const rows = [
      row({ categoryId: 'a' }),
      row({ categoryId: 'b' }),
      row({ categoryId: 'c' }),
      row({ categoryId: 'd' }),
    ]

    for (const isCurrentMonth of [true, false]) {
      expect(orderAchievements(rows, { isCurrentMonth }).map((r) => r.categoryId)).toEqual([
        'a',
        'b',
        'c',
        'd',
      ])
    }
  })
})
