import type { FundType } from './fundType'
import type { TxnSource } from './types'

export const MIN_RECURRING_PATTERN_MONTHS = 3
export const MAX_RECURRING_AMOUNT_VARIANCE_RATIO = 0.05
export const MAX_RECURRING_DAY_SPREAD = 3

export interface RecurringSuggestionTxn {
  categoryId: string
  type: FundType
  amount: number
  txnDate: string
  memo: string | null
  source: TxnSource
}

export interface RecurringSuggestionCategory {
  id: string
  name: string
  type: FundType
  isActive: boolean
}

export interface ExistingRecurringPattern {
  categoryId: string
  amount: number
  dayOfMonth: number
}

export interface RecurringSuggestion {
  categoryId: string
  categoryName: string
  type: FundType
  name: string
  amount: number
  dayOfMonth: number
  memo: string | null
  months: string[]
  amountMin: number
  amountMax: number
  dayMin: number
  dayMax: number
}

interface PatternTxn extends RecurringSuggestionTxn {
  /** Stable identity for de-duplicating and consuming candidates. */
  seq: number
  month: string
  day: number
  normalizedMemo: string
}

interface Cluster {
  /** Exactly one transaction per month, sorted by date. */
  txns: PatternTxn[]
  months: string[]
  amountMin: number
  amountMax: number
  dayMin: number
  dayMax: number
}

function normalizedMemo(memo: string | null): string {
  return memo?.trim().replace(/\s+/g, ' ').toLocaleLowerCase('ko-KR') ?? ''
}

function parseTxnDate(txnDate: string): { month: string; day: number } | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(txnDate)
  if (!match) return null
  const month = Number(match[2])
  const day = Number(match[3])
  if (month < 1 || month > 12 || day < 1 || day > new Date(Number(match[1]), month, 0).getDate()) {
    return null
  }
  return { month: txnDate.slice(0, 7), day }
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[middle]
  return Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function amountsAreSimilar(a: number, b: number): boolean {
  const larger = Math.max(a, b)
  return larger > 0 && Math.abs(a - b) / larger <= MAX_RECURRING_AMOUNT_VARIANCE_RATIO
}

function earlier(a: PatternTxn, b: PatternTxn): PatternTxn {
  if (a.txnDate !== b.txnDate) return a.txnDate < b.txnDate ? a : b
  return a.seq < b.seq ? a : b
}

/**
 * Reduces a valid window to one occurrence per month — a recurring item bills
 * once a month, so a second matching row in the same month is a duplicate, not
 * part of the pattern. Any representative keeps the window valid (every member
 * already satisfies both spreads), so the earliest row in the month wins.
 */
function buildCluster(windowTxns: readonly PatternTxn[]): Cluster {
  const byMonth = new Map<string, PatternTxn>()
  for (const txn of windowTxns) {
    const current = byMonth.get(txn.month)
    byMonth.set(txn.month, current ? earlier(current, txn) : txn)
  }
  const txns = [...byMonth.values()].sort(
    (a, b) => a.txnDate.localeCompare(b.txnDate) || a.seq - b.seq,
  )
  const cluster: Cluster = {
    txns,
    months: [...byMonth.keys()].sort(),
    amountMin: txns[0].amount,
    amountMax: txns[0].amount,
    dayMin: txns[0].day,
    dayMax: txns[0].day,
  }
  for (const txn of txns) {
    cluster.amountMin = Math.min(cluster.amountMin, txn.amount)
    cluster.amountMax = Math.max(cluster.amountMax, txn.amount)
    cluster.dayMin = Math.min(cluster.dayMin, txn.day)
    cluster.dayMax = Math.max(cluster.dayMax, txn.day)
  }
  return cluster
}

/**
 * Enumerates every maximal valid cluster of a group.
 *
 * Both rules bound an interval width, so a cluster is pinned by two anchors:
 * its smallest day and its smallest amount. Anchoring on each observed day, and
 * on each row of the amount-sorted subset, therefore produces a superset of the
 * valid clusters — no pattern can be lost to the order rows arrive in.
 *
 * The amount rule `(max - min) / max <= ratio` relaxes as `min` rises and
 * tightens as `max` rises, so checking only the window extremes covers every
 * pair inside it and the right edge never moves backwards: one two-pointer
 * sweep per day anchor is enough.
 */
function collectCandidates(txns: readonly PatternTxn[]): Cluster[] {
  const byAmount = [...txns].sort(
    (a, b) => a.amount - b.amount || a.txnDate.localeCompare(b.txnDate) || a.seq - b.seq,
  )
  const dayAnchors = [...new Set(txns.map((txn) => txn.day))].sort((a, b) => a - b)
  const candidates: Cluster[] = []
  const seen = new Set<string>()

  for (const anchor of dayAnchors) {
    const subset = byAmount.filter(
      (txn) => txn.day >= anchor && txn.day <= anchor + MAX_RECURRING_DAY_SPREAD,
    )
    const monthCounts = new Map<string, number>()
    let end = 0
    for (let start = 0; start < subset.length; start += 1) {
      while (end < subset.length && amountsAreSimilar(subset[start].amount, subset[end].amount)) {
        monthCounts.set(subset[end].month, (monthCounts.get(subset[end].month) ?? 0) + 1)
        end += 1
      }
      if (monthCounts.size >= MIN_RECURRING_PATTERN_MONTHS) {
        const cluster = buildCluster(subset.slice(start, end))
        const key = cluster.txns.map((txn) => txn.seq).join(',')
        if (!seen.has(key)) {
          seen.add(key)
          candidates.push(cluster)
        }
      }
      // Drop `start` from the window; `end > start` always, so it never empties.
      const remaining = (monthCounts.get(subset[start].month) ?? 1) - 1
      if (remaining > 0) monthCounts.set(subset[start].month, remaining)
      else monthCounts.delete(subset[start].month)
    }
  }
  return candidates
}

function compareCandidates(a: Cluster, b: Cluster): number {
  if (a.months.length !== b.months.length) return b.months.length - a.months.length
  const amountSpread = a.amountMax - a.amountMin - (b.amountMax - b.amountMin)
  if (amountSpread !== 0) return amountSpread
  const daySpread = a.dayMax - a.dayMin - (b.dayMax - b.dayMin)
  if (daySpread !== 0) return daySpread
  if (a.months[0] !== b.months[0]) return a.months[0].localeCompare(b.months[0])
  return a.amountMin - b.amountMin
}

/**
 * Takes candidates best-first, letting each transaction back exactly one
 * suggestion. Trimming a candidate to its unconsumed rows keeps it valid — a
 * subset of a valid cluster satisfies both spreads — so the leftovers are only
 * dropped when they no longer cover enough months.
 */
function selectClusters(candidates: readonly Cluster[]): Cluster[] {
  const used = new Set<number>()
  const selected: Cluster[] = []
  for (const candidate of [...candidates].sort(compareCandidates)) {
    const available = candidate.txns.filter((txn) => !used.has(txn.seq))
    if (available.length < MIN_RECURRING_PATTERN_MONTHS) continue
    const cluster = buildCluster(available)
    for (const txn of cluster.txns) used.add(txn.seq)
    selected.push(cluster)
  }
  return selected
}

function matchesExisting(
  suggestion: Pick<RecurringSuggestion, 'categoryId' | 'amount' | 'dayOfMonth'>,
  existing: readonly ExistingRecurringPattern[],
): boolean {
  return existing.some(
    (item) =>
      item.categoryId === suggestion.categoryId &&
      amountsAreSimilar(item.amount, suggestion.amount) &&
      Math.abs(item.dayOfMonth - suggestion.dayOfMonth) <= MAX_RECURRING_DAY_SPREAD,
  )
}

/**
 * Finds conservative monthly patterns without calling an LLM or mutating data.
 *
 * A candidate needs the same active category and normalized memo, one matching
 * manual transaction in at least three distinct months, an amount range within
 * 5%, and a day-of-month spread within three days. Existing recurring patterns
 * are removed so accepting a suggestion cannot create an obvious duplicate.
 *
 * Clusters are enumerated rather than grown row by row: with amounts drifting
 * month over month, a first-fit pass can spend an early row on a pair that
 * blocks a longer run (100 / 104 / 108 / 108 pairs 100 with 104, after which
 * 108 no longer fits even though 104-108 spans three months within the limit).
 */
export function suggestRecurringItems(
  transactions: readonly RecurringSuggestionTxn[],
  categories: readonly RecurringSuggestionCategory[],
  existing: readonly ExistingRecurringPattern[] = [],
): RecurringSuggestion[] {
  const categoryById = new Map(categories.filter((c) => c.isActive).map((c) => [c.id, c]))
  const grouped = new Map<string, PatternTxn[]>()
  let seq = 0

  for (const txn of transactions) {
    if (txn.source !== 'manual' || !Number.isSafeInteger(txn.amount) || txn.amount <= 0) continue
    const category = categoryById.get(txn.categoryId)
    if (!category || category.type !== txn.type) continue
    const parsedDate = parseTxnDate(txn.txnDate)
    if (!parsedDate) continue
    const memoKey = normalizedMemo(txn.memo)
    const key = `${txn.categoryId}\u0000${memoKey}`
    const record: PatternTxn = {
      ...txn,
      seq: seq++,
      month: parsedDate.month,
      day: parsedDate.day,
      normalizedMemo: memoKey,
    }
    const group = grouped.get(key)
    if (group) group.push(record)
    else grouped.set(key, [record])
  }

  const suggestions: RecurringSuggestion[] = []

  for (const txns of grouped.values()) {
    for (const cluster of selectClusters(collectCandidates(txns))) {
      const first = cluster.txns[0]
      const category = categoryById.get(first.categoryId)
      if (!category) continue
      const memo = first.normalizedMemo ? first.memo?.trim() || null : null
      const suggestion: RecurringSuggestion = {
        categoryId: category.id,
        categoryName: category.name,
        type: category.type,
        name: memo ?? category.name,
        amount: median(cluster.txns.map((txn) => txn.amount)),
        dayOfMonth: median(cluster.txns.map((txn) => txn.day)),
        memo,
        months: cluster.months,
        amountMin: cluster.amountMin,
        amountMax: cluster.amountMax,
        dayMin: cluster.dayMin,
        dayMax: cluster.dayMax,
      }
      if (!matchesExisting(suggestion, existing)) suggestions.push(suggestion)
    }
  }

  return suggestions.sort((a, b) => {
    if (b.months.length !== a.months.length) return b.months.length - a.months.length
    const aAmountSpread = a.amountMax - a.amountMin
    const bAmountSpread = b.amountMax - b.amountMin
    if (aAmountSpread !== bAmountSpread) return aAmountSpread - bAmountSpread
    return a.categoryName.localeCompare(b.categoryName, 'ko-KR')
  })
}
