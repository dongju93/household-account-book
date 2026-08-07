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
  month: string
  day: number
  normalizedMemo: string
}

interface Cluster {
  txns: PatternTxn[]
  months: Set<string>
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

function canJoin(cluster: Cluster, txn: PatternTxn): boolean {
  if (cluster.months.has(txn.month)) return false
  const nextAmountMin = Math.min(cluster.amountMin, txn.amount)
  const nextAmountMax = Math.max(cluster.amountMax, txn.amount)
  const nextDayMin = Math.min(cluster.dayMin, txn.day)
  const nextDayMax = Math.max(cluster.dayMax, txn.day)
  return (
    amountsAreSimilar(nextAmountMin, nextAmountMax) &&
    nextDayMax - nextDayMin <= MAX_RECURRING_DAY_SPREAD
  )
}

function addToCluster(cluster: Cluster, txn: PatternTxn): void {
  cluster.txns.push(txn)
  cluster.months.add(txn.month)
  cluster.amountMin = Math.min(cluster.amountMin, txn.amount)
  cluster.amountMax = Math.max(cluster.amountMax, txn.amount)
  cluster.dayMin = Math.min(cluster.dayMin, txn.day)
  cluster.dayMax = Math.max(cluster.dayMax, txn.day)
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
 */
export function suggestRecurringItems(
  transactions: readonly RecurringSuggestionTxn[],
  categories: readonly RecurringSuggestionCategory[],
  existing: readonly ExistingRecurringPattern[] = [],
): RecurringSuggestion[] {
  const categoryById = new Map(categories.filter((c) => c.isActive).map((c) => [c.id, c]))
  const grouped = new Map<string, PatternTxn[]>()

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
    const clusters: Cluster[] = []
    for (const txn of [...txns].sort((a, b) => a.txnDate.localeCompare(b.txnDate))) {
      const cluster = clusters.find((candidate) => canJoin(candidate, txn))
      if (cluster) {
        addToCluster(cluster, txn)
      } else {
        clusters.push({
          txns: [txn],
          months: new Set([txn.month]),
          amountMin: txn.amount,
          amountMax: txn.amount,
          dayMin: txn.day,
          dayMax: txn.day,
        })
      }
    }

    for (const cluster of clusters) {
      if (cluster.months.size < MIN_RECURRING_PATTERN_MONTHS) continue
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
        months: [...cluster.months].sort(),
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
