import { won } from '../lib/format'
import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'
import type { AchievementRow } from './achievement'
import type { CategoryLike, RecurringItem, Transaction } from './types'

export type MonthCloseFindingKind =
  | 'missing_recurring'
  | 'duplicate_candidate'
  | 'unmemoed_large_expense'
  | 'over_budget'
  | 'under_saving_goal'

export interface MonthCloseFinding {
  kind: MonthCloseFindingKind
  label: string
  nav: { month: string; categoryId?: string; memoContains?: string }
}

// `amount` is a same-shape sort key carried alongside each finding while a finder
// builds its list; stripped before returning so it never leaks into the public shape.
type Ranked = MonthCloseFinding & { amount: number }
const byAmountDesc = (a: Ranked, b: Ranked) => b.amount - a.amount
const dropAmount = ({ amount: _amount, ...finding }: Ranked): MonthCloseFinding => finding

/**
 * Active recurring items with no materialized occurrence in `materializedTxns`
 * for `ym`. Expected to always be empty in practice — `materialize_recurring`
 * already guarantees this via its unique index — so callers must pre-filter
 * `recurringItems` to drop anything covered by a `recurring_skips` row for
 * `ym` first. A skipped item is not "missing" (it was never supposed to
 * materialize this month); an item that survives that filter and still has no
 * matching transaction here means materialization itself is broken.
 */
export function findMissingRecurringOccurrences(
  recurringItems: readonly RecurringItem[],
  materializedTxns: readonly Transaction[],
  ym: YearMonth,
): MonthCloseFinding[] {
  const month = monthKey(ym.year, ym.month)
  const materializedRecurringIds = new Set(
    materializedTxns
      .filter((t) => t.source === 'recurring' && t.occurrenceMonth?.slice(0, 7) === month)
      .map((t) => t.recurringId),
  )

  const findings: Ranked[] = []
  for (const item of recurringItems) {
    if (!item.isActive) continue
    if (item.startMonth.slice(0, 7) > month) continue
    if (item.endMonth && item.endMonth.slice(0, 7) < month) continue
    if (materializedRecurringIds.has(item.id)) continue

    findings.push({
      kind: 'missing_recurring',
      label: `고정 항목 "${item.name}"이 이번 달 내역에 반영되지 않았습니다.`,
      nav: { month, categoryId: item.categoryId },
      amount: item.amount,
    })
  }

  return findings.sort(byAmountDesc).map(dropAmount)
}

/** Group key: same date + amount + category + memo (trimmed, null treated as ''). */
function duplicateKey(t: Transaction): string {
  return `${t.txnDate}|${t.amount}|${t.categoryId}|${(t.memo ?? '').trim()}`
}

/** Same date, amount, category, and (trimmed) memo repeated 2+ times within the month. */
export function findDuplicateCandidates(
  txns: readonly Transaction[],
  categoryNameById: ReadonlyMap<string, string>,
  ym: YearMonth,
): MonthCloseFinding[] {
  const month = monthKey(ym.year, ym.month)
  const groups = new Map<string, Transaction[]>()
  for (const t of txns) {
    const key = duplicateKey(t)
    const group = groups.get(key)
    if (group) group.push(t)
    else groups.set(key, [t])
  }

  const findings: Ranked[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    const [first] = group
    const categoryName = categoryNameById.get(first.categoryId) ?? '카테고리 없음'
    findings.push({
      kind: 'duplicate_candidate',
      label: `${first.txnDate} ${categoryName} ${won(first.amount)} 거래가 ${group.length}건 반복되었습니다.`,
      nav: {
        month,
        categoryId: first.categoryId,
        memoContains: (first.memo ?? '').trim() || undefined,
      },
      amount: first.amount * group.length,
    })
  }

  return findings.sort(byAmountDesc).map(dropAmount)
}

/** Nearest-rank percentile over an ascending-sorted array (p in 0..100). */
function percentile(sortedAsc: readonly number[], p: number): number {
  if (sortedAsc.length === 0) return 0
  const idx = Math.min(
    sortedAsc.length - 1,
    Math.max(0, Math.ceil((p / 100) * sortedAsc.length) - 1),
  )
  return sortedAsc[idx]
}

/**
 * Expense transactions with no memo (null or blank) and an amount in the top
 * 10% of the month's expense amounts. No schema column exists for a user-set
 * absolute threshold, so this uses a relative percentile instead — see
 * docs/3. ai-plan-month-close-review.md §3.
 */
export function findUnmemoedLargeExpenses(
  txns: readonly Transaction[],
  categoryNameById: ReadonlyMap<string, string>,
  ym: YearMonth,
): MonthCloseFinding[] {
  const month = monthKey(ym.year, ym.month)
  const expenses = txns.filter((t) => t.type === 'expense')
  if (expenses.length === 0) return []

  const threshold = percentile(
    expenses.map((t) => t.amount).sort((a, b) => a - b),
    90,
  )

  const findings: Ranked[] = []
  for (const t of expenses) {
    if ((t.memo ?? '').trim() !== '') continue
    if (t.amount < threshold) continue
    const categoryName = categoryNameById.get(t.categoryId) ?? '카테고리 없음'
    findings.push({
      kind: 'unmemoed_large_expense',
      label: `${t.txnDate} ${categoryName} ${won(t.amount)} 지출에 메모가 없습니다.`,
      nav: { month, categoryId: t.categoryId },
      amount: t.amount,
    })
  }

  return findings.sort(byAmountDesc).map(dropAmount)
}

/**
 * Over-budget 지출 categories and not-yet-achieved 저축 categories, sourced
 * from the same `computeAchievements` rows the dashboard renders — this
 * function only re-classifies them, it never recomputes actuals.
 */
export function findBudgetAndGoalFindings(
  achievements: readonly AchievementRow[],
  ym: YearMonth,
): MonthCloseFinding[] {
  const month = monthKey(ym.year, ym.month)
  const findings: Ranked[] = []
  for (const row of achievements) {
    if (row.type === 'expense' && row.status === '초과') {
      findings.push({
        kind: 'over_budget',
        label: `${row.name} 카테고리가 예산을 ${won(row.actual - row.target)} 초과했습니다.`,
        nav: { month, categoryId: row.categoryId },
        amount: row.actual - row.target,
      })
    } else if (row.type === 'saving' && row.status !== '달성' && row.target > 0) {
      findings.push({
        kind: 'under_saving_goal',
        label: `${row.name} 저축 목표에 ${won(row.remaining)} 못 미쳤습니다.`,
        nav: { month, categoryId: row.categoryId },
        amount: row.remaining,
      })
    }
  }

  return findings.sort(byAmountDesc).map(dropAmount)
}

const DEFAULT_MAX_FINDINGS_PER_KIND = 10

// missing_recurring and over_budget are mistakes that already happened
// (materialization bug / overspent); duplicate_candidate flags a possible
// double charge. All three are worth a look. under_saving_goal and
// unmemoed_large_expense are informational — nothing went wrong, just noted.
const NEEDS_CHECK_KINDS = new Set<MonthCloseFindingKind>([
  'missing_recurring',
  'duplicate_candidate',
  'over_budget',
])

function truncatePerKind(
  findings: readonly MonthCloseFinding[],
  maxPerKind: number,
): { kept: MonthCloseFinding[]; truncated: boolean } {
  const byKind = new Map<MonthCloseFindingKind, MonthCloseFinding[]>()
  for (const f of findings) {
    const list = byKind.get(f.kind)
    if (list) list.push(f)
    else byKind.set(f.kind, [f])
  }

  let truncated = false
  const kept: MonthCloseFinding[] = []
  for (const list of byKind.values()) {
    if (list.length > maxPerKind) truncated = true
    // Each finder already returns its list sorted amount-desc, so a plain
    // slice keeps the largest-magnitude candidates per kind.
    kept.push(...list.slice(0, maxPerKind))
  }
  return { kept, truncated }
}

/**
 * Runs every finder for `ym` and splits the combined findings into 확인 필요
 * ("needs check") and 참고 ("for reference"). `recurringItems` must already
 * exclude anything skipped for `ym` (see `findMissingRecurringOccurrences`) —
 * the caller fetches `recurring_skips` and filters before calling this.
 */
export function reviewMonth(input: {
  recurringItems: readonly RecurringItem[]
  txns: readonly Transaction[]
  categories: readonly CategoryLike[]
  achievements: readonly AchievementRow[]
  ym: YearMonth
  maxFindingsPerKind?: number
}): { needsCheck: MonthCloseFinding[]; forReference: MonthCloseFinding[]; truncated: boolean } {
  const maxPerKind = input.maxFindingsPerKind ?? DEFAULT_MAX_FINDINGS_PER_KIND
  const categoryNameById = new Map(input.categories.map((c) => [c.id, c.name]))

  const all = [
    ...findMissingRecurringOccurrences(input.recurringItems, input.txns, input.ym),
    ...findDuplicateCandidates(input.txns, categoryNameById, input.ym),
    ...findUnmemoedLargeExpenses(input.txns, categoryNameById, input.ym),
    ...findBudgetAndGoalFindings(input.achievements, input.ym),
  ]

  const needsCheckAll = all.filter((f) => NEEDS_CHECK_KINDS.has(f.kind))
  const forReferenceAll = all.filter((f) => !NEEDS_CHECK_KINDS.has(f.kind))

  const needsCheck = truncatePerKind(needsCheckAll, maxPerKind)
  const forReference = truncatePerKind(forReferenceAll, maxPerKind)

  return {
    needsCheck: needsCheck.kept,
    forReference: forReference.kept,
    truncated: needsCheck.truncated || forReference.truncated,
  }
}
