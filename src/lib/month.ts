// Calendar-month helpers. Custom month-start-day is deferred (spec §7.3): every
// screen routes month boundaries through monthRange(), so adding a cutover later
// is a single-function change here plus an optional ledgers.month_start_day.

export interface YearMonth {
  year: number
  month: number // 1..12
}

export interface MonthRange {
  start: string // 'YYYY-MM-DD' inclusive
  endExclusive: string // 'YYYY-MM-DD' exclusive (first day of next month)
}

export function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}`
}

/** Parses a 'YYYY-MM' string into a YearMonth, or null if malformed / out of range. */
export function parseMonthKey(month: string): YearMonth | null {
  const match = /^(\d{4})-(\d{2})$/.exec(month)
  if (!match) return null
  const parsedMonth = Number(match[2])
  if (parsedMonth < 1 || parsedMonth > 12) return null
  return { year: Number(match[1]), month: parsedMonth }
}

export function monthRange(year: number, month: number): MonthRange {
  const start = `${monthKey(year, month)}-01`
  const next = addMonths({ year, month }, 1)
  return { start, endExclusive: `${monthKey(next.year, next.month)}-01` }
}

export function addMonths(ym: YearMonth, delta: number): YearMonth {
  const idx = ym.year * 12 + (ym.month - 1) + delta
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 }
}

export function currentYearMonth(): YearMonth {
  const d = new Date()
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** The `count` months ending at `anchor` (inclusive), ascending. */
export function lastMonths(anchor: YearMonth, count: number): YearMonth[] {
  return Array.from({ length: count }, (_, i) => addMonths(anchor, -(count - 1 - i)))
}

/**
 * The single MonthRange spanning the `count` months ending at `anchor`
 * (inclusive) — i.e. `[first-of-window, first-of-month-after-anchor)`. Collapses
 * the repeated `monthRange(window[0]).start` + `monthRange(anchor).endExclusive`
 * boilerplate that ReportsPage and the qna_* tools each hand-rolled.
 */
export function monthWindowRange(anchor: YearMonth, count: number): MonthRange {
  const first = addMonths(anchor, -(count - 1))
  return {
    start: monthRange(first.year, first.month).start,
    endExclusive: monthRange(anchor.year, anchor.month).endExclusive,
  }
}

/** Display label "2026.06". */
export function formatMonthLabel(ym: YearMonth): string {
  return `${ym.year}.${String(ym.month).padStart(2, '0')}`
}

/** Today's local date as 'YYYY-MM-DD' (default for new transactions). */
export function todayISO(): string {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

/**
 * Shifts an ISO 'YYYY-MM-DD' date by `delta` days, crossing month/year
 * boundaries. Built on UTC so a DST shift can never move the result to the
 * neighbouring day — these are calendar dates, not instants.
 */
export function addDaysISO(iso: string, delta: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  const shifted = new Date(Date.UTC(y, m - 1, d + delta))
  return shifted.toISOString().slice(0, 10)
}

/** Calendar length of a month (28–31). */
export function daysInCalendarMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate()
}

/** Day-of-month (1–31) from an ISO date in local parsing. */
export function dayOfMonthFromISO(iso: string): number {
  return Number(iso.slice(8, 10))
}

/** Whether `iso` falls in the same calendar month as `ym`. */
export function isSameYearMonth(ym: YearMonth, iso: string): boolean {
  return iso.slice(0, 7) === monthKey(ym.year, ym.month)
}

/** Korean weekday + date header, e.g. "6월 6일 (금)". */
export function formatDayHeader(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  const weekday = ['일', '월', '화', '수', '목', '금', '토'][date.getDay()]
  return `${m}월 ${d}일 (${weekday})`
}
