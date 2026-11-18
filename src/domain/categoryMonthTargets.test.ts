import { describe, expect, it } from 'vite-plus/test'

import {
  applyCategoryMonthTargets,
  type CategoryMonthTarget,
  parseMonthTargetChoice,
  parseTargetAmount,
} from './categoryMonthTargets'
import type { CategoryLike } from './types'

const ym = { year: 2026, month: 11 }
const categories: CategoryLike[] = [
  { id: 'food', name: '식비', type: 'expense', budgetAmount: 500_000, goalAmount: null },
  { id: 'travel', name: '교통', type: 'expense', budgetAmount: 100_000, goalAmount: null },
  { id: 'saving', name: '비상금', type: 'saving', budgetAmount: null, goalAmount: 1_000_000 },
]
const target = (
  categoryId: string,
  value: number,
  source: 'custom' | 'global' = 'custom',
  month = '2026-11-01',
): CategoryMonthTarget => ({
  categoryId,
  month,
  source,
  customAmount: parseTargetAmount(value)!,
})

describe('monthly category target contracts', () => {
  it.each([0, 1, 9007199254740991, '600,000', '₩ 600,000'])(
    'parses exact integer KRW: %s',
    (raw) => {
      expect(parseTargetAmount(raw)).not.toBeNull()
    },
  )
  it.each([
    '',
    ' ',
    '-1',
    '1.5',
    '1e3',
    'NaN',
    1.5,
    -1,
    NaN,
    Infinity,
    9007199254740992,
    null,
    {},
    true,
  ])('rejects invalid amounts without truncating: %s', (raw) => {
    expect(parseTargetAmount(raw)).toBeNull()
    expect(parseMonthTargetChoice('custom', raw).ok).toBe(false)
  })
  it('global selection needs no custom input', () => {
    expect(parseMonthTargetChoice('global', '')).toEqual({ ok: true, value: { source: 'global' } })
  })
  it('resolves independently per category and month, leaving global objects intact', () => {
    const targets = [
      target('food', 600_000),
      target('saving', 800_000),
      target('travel', 900_000, 'custom', '2026-10-01'),
    ]
    const resolved = applyCategoryMonthTargets(categories, targets, ym)
    expect(resolved.map((c) => [c.budgetAmount, c.goalAmount])).toEqual([
      [600_000, null],
      [100_000, null],
      [null, 800_000],
    ])
    expect(categories[0].budgetAmount).toBe(500_000)
    expect(applyCategoryMonthTargets(categories, targets, { year: 2026, month: 12 })).toEqual(
      categories,
    )
    expect(applyCategoryMonthTargets(resolved, targets, ym)).toEqual(resolved)
  })
  it('keeps a saved custom amount through a global/custom round trip and follows live global changes', () => {
    const saved = target('food', 600_000)
    const updatedGlobals = categories.map((c) => ({
      ...c,
      budgetAmount: c.id === 'food' ? 550_000 : c.budgetAmount,
    }))
    expect(
      applyCategoryMonthTargets(updatedGlobals, [{ ...saved, source: 'global' }], ym)[0]
        .budgetAmount,
    ).toBe(550_000)
    expect(applyCategoryMonthTargets(updatedGlobals, [saved], ym)[0].budgetAmount).toBe(600_000)
    expect(saved.customAmount).toBe(600_000)
  })
  it('zero is an intentional custom value and does not fall back to global', () => {
    expect(applyCategoryMonthTargets(categories, [target('food', 0)], ym)[0].budgetAmount).toBe(0)
  })
})
