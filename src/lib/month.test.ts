import { describe, expect, it } from 'vitest'
import { addMonths, formatMonthLabel, monthKey, monthRange } from './month'

describe('addMonths', () => {
  it('wraps across year boundaries in both directions', () => {
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 })
    expect(addMonths({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 })
    expect(addMonths({ year: 2026, month: 6 }, -5)).toEqual({ year: 2026, month: 1 })
  })
})

describe('monthRange (calendar month, exclusive end)', () => {
  it('handles a normal month', () => {
    expect(monthRange(2026, 6)).toEqual({ start: '2026-06-01', endExclusive: '2026-07-01' })
  })
  it('rolls the end into the next year for December', () => {
    expect(monthRange(2026, 12)).toEqual({ start: '2026-12-01', endExclusive: '2027-01-01' })
  })
})

describe('month formatting', () => {
  it('zero-pads the month', () => {
    expect(monthKey(2026, 3)).toBe('2026-03')
    expect(formatMonthLabel({ year: 2026, month: 3 })).toBe('2026.03')
  })
})
