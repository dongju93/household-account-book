import { describe, expect, it } from 'vite-plus/test'

import {
  addMonths,
  formatMonthLabel,
  monthKey,
  monthRange,
  monthWindowRange,
  parseMonthKey,
} from './month'

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

describe('monthWindowRange (window ending at anchor, inclusive)', () => {
  it('spans the count months up to and including the anchor', () => {
    expect(monthWindowRange({ year: 2026, month: 6 }, 3)).toEqual({
      start: '2026-04-01',
      endExclusive: '2026-07-01',
    })
  })
  it('reaches back across a year boundary', () => {
    expect(monthWindowRange({ year: 2026, month: 2 }, 6)).toEqual({
      start: '2025-09-01',
      endExclusive: '2026-03-01',
    })
  })
  it('collapses to a single calendar month when count is 1', () => {
    expect(monthWindowRange({ year: 2026, month: 6 }, 1)).toEqual(monthRange(2026, 6))
  })
  it('handles the full 12-month window', () => {
    expect(monthWindowRange({ year: 2026, month: 6 }, 12)).toEqual({
      start: '2025-07-01',
      endExclusive: '2026-07-01',
    })
  })
})

describe('month formatting', () => {
  it('zero-pads the month', () => {
    expect(monthKey(2026, 3)).toBe('2026-03')
    expect(formatMonthLabel({ year: 2026, month: 3 })).toBe('2026.03')
  })
})

describe('parseMonthKey', () => {
  it('parses a valid YYYY-MM string', () => {
    expect(parseMonthKey('2026-06')).toEqual({ year: 2026, month: 6 })
  })

  it('returns null for malformed input', () => {
    expect(parseMonthKey('2026-6')).toBeNull()
    expect(parseMonthKey('2026/06')).toBeNull()
    expect(parseMonthKey('not-a-month')).toBeNull()
  })

  it('returns null for an out-of-range month', () => {
    expect(parseMonthKey('2026-00')).toBeNull()
    expect(parseMonthKey('2026-13')).toBeNull()
  })
})
