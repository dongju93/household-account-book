import { addDaysISO } from '../lib/month'
import type { FundType } from './fundType'

/**
 * Fuzzy (near) duplicate detection — spec §5.7 / §5.14.
 *
 * The exact `duplicateKey` used before this module (date|amount|category|memo)
 * only caught a re-entry that repeated *every* field verbatim. The two ways a
 * real double entry actually differs are the date (logged today, then again
 * tomorrow) and the memo (typed once, left blank the second time). This module
 * widens the match along exactly those two axes and nothing else.
 *
 * It is the single definition of "near duplicate" for all three consumers —
 * the month-close finding, the transaction-list banner, and the pre-save guard.
 * They must not re-derive it: a guard that blocked a save the banner would not
 * have flagged (or vice versa) is a contradiction the user cannot resolve.
 *
 * Pure: no Supabase, no network, no LLM. Detection produces *labels only* —
 * nothing here mutates or proposes a mutation (§5.7 "자동 삭제 금지").
 */

/** The minimum a row needs to be considered; `Transaction` satisfies it structurally. */
export interface DuplicateCandidateTxn {
  id: string
  txnDate: string // 'YYYY-MM-DD'
  type: FundType
  amount: number
  categoryId: string
  memo: string | null
}

/**
 * Why a group was flagged, most-certain first. Derived from the group's members
 * rather than stored per pair, so a group can never claim a reason its members
 * contradict.
 *
 * - `exact`   — same day, same memo. What the old exact key already caught.
 * - `adjacent_day` — the group spans two consecutive days.
 * - `similar_memo` — same day, memos differ (one blank, or one contains the other).
 */
export type FuzzyDuplicateReason = 'exact' | 'adjacent_day' | 'similar_memo'

export interface FuzzyDuplicateGroup {
  reason: FuzzyDuplicateReason
  /** ≥2 members, ascending by (date, id). */
  txns: DuplicateCandidateTxn[]
  type: FundType
  amount: number
  categoryId: string
  /** Earliest member date. */
  firstDate: string
  /** Latest member date — equal to `firstDate` unless `reason` is `adjacent_day`. */
  lastDate: string
  /**
   * The shared memo (raw, trimmed) when every member carries the *byte-identical*
   * non-blank memo; `null` otherwise. A group whose memos merely *resemble* each
   * other has no single memo that describes it, so callers must not narrow a
   * search by one.
   *
   * Identity here is deliberately stricter than `reason === 'exact'`, which is
   * decided on normalized memos: '카페  라떼' and '카페 라떼' are the same purchase,
   * but a literal `memo LIKE '%카페 라떼%'` does not find the double-spaced row.
   * This field is a *narrowing* value, so returning one that matches only some
   * members is worse than returning none — the caller falls back to a wider
   * query that still contains every row.
   */
  sharedMemo: string | null
}

/** Trim, lowercase, collapse internal whitespace. `null` and '   ' both become ''. */
export function normalizeMemo(memo: string | null | undefined): string {
  return (memo ?? '').trim().toLowerCase().replace(/\s+/g, ' ')
}

// A one-character memo ("커" / "a") is contained in far too many others to carry
// any signal; substring matching requires both sides to reach this length.
// Exact equality is always allowed, whatever the length.
const MIN_SUBSTRING_LENGTH = 2

/**
 * Whether two memos are close enough that the rows could be the same purchase.
 * A blank memo is compatible with anything: re-entering a transaction without
 * retyping the memo is the single most common way a duplicate differs.
 */
function memosCompatible(a: string, b: string): boolean {
  if (a === b) return true
  if (a === '' || b === '') return true
  if (a.length < MIN_SUBSTRING_LENGTH || b.length < MIN_SUBSTRING_LENGTH) return false
  return a.includes(b) || b.includes(a)
}

function withinOneDay(a: string, b: string): boolean {
  return a === b || b === addDaysISO(a, 1) || a === addDaysISO(b, 1)
}

/**
 * The pair predicate. Type, amount, and category must match *exactly* — money is
 * a BIGINT KRW integer, so "same amount" is an unambiguous, high-signal anchor,
 * and holding the category fixed keeps this an extension of the old exact key
 * along only the two axes §5.7 names. Only date and memo are fuzzy.
 */
export function isNearDuplicate(a: DuplicateCandidateTxn, b: DuplicateCandidateTxn): boolean {
  if (a.type !== b.type) return false
  if (a.amount !== b.amount) return false
  if (a.categoryId !== b.categoryId) return false
  if (!withinOneDay(a.txnDate, b.txnDate)) return false
  return memosCompatible(normalizeMemo(a.memo), normalizeMemo(b.memo))
}

function groupBucketKey(t: DuplicateCandidateTxn): string {
  return `${t.type}|${t.amount}|${t.categoryId}`
}

function describeGroup(members: DuplicateCandidateTxn[]): FuzzyDuplicateGroup {
  const first = members[0]
  const last = members[members.length - 1]
  const normalized = members.map((t) => normalizeMemo(t.memo))
  const allSameMemo = normalized.every((m) => m === normalized[0])

  const reason: FuzzyDuplicateReason =
    first.txnDate !== last.txnDate ? 'adjacent_day' : allSameMemo ? 'exact' : 'similar_memo'

  // Compared raw (trim only), not normalized: `sharedMemo` is handed to callers as
  // a literal memo search term, and normalization is exactly what makes two spellings
  // that a literal search cannot both find compare equal.
  const rawTrimmed = members.map((t) => (t.memo ?? '').trim())
  const sharedRawMemo = rawTrimmed.every((m) => m === rawTrimmed[0]) ? rawTrimmed[0] : ''

  return {
    reason,
    txns: members,
    type: first.type,
    amount: first.amount,
    categoryId: first.categoryId,
    firstDate: first.txnDate,
    lastDate: last.txnDate,
    // Identical raw memos are necessarily identical normalized ones, so a non-null
    // `sharedMemo` always implies `allSameMemo`; the converse does not hold.
    sharedMemo: sharedRawMemo === '' ? null : sharedRawMemo,
  }
}

/**
 * Groups of ≥2 mutually near-duplicate rows.
 *
 * A candidate joins a cluster only if it is a near duplicate of **every** member
 * already in it, not just the first. `withinOneDay` is not transitive, so an
 * anchor-only check would chain 06-05 → 06-06 → 06-07 into one "duplicate"
 * spanning three days; requiring agreement with all members bounds every group
 * to a two-day window structurally, with no separate span check to keep in sync.
 * It also stops a blank-memo row from bridging two unrelated memos into one group.
 *
 * Callers pass a bounded set (one month's rows, or a ±1-day query), so the
 * within-bucket O(k²) comparison is over a handful of rows.
 */
export function findFuzzyDuplicateGroups(
  txns: readonly DuplicateCandidateTxn[],
): FuzzyDuplicateGroup[] {
  const buckets = new Map<string, DuplicateCandidateTxn[]>()
  for (const t of txns) {
    const key = groupBucketKey(t)
    const bucket = buckets.get(key)
    if (bucket) bucket.push(t)
    else buckets.set(key, [t])
  }

  const groups: FuzzyDuplicateGroup[] = []
  for (const bucket of buckets.values()) {
    if (bucket.length < 2) continue
    // Ascending by (date, id) so clusters form left to right and `firstDate` /
    // `lastDate` fall out of the member order instead of a second sort.
    const sorted = [...bucket].sort((a, b) =>
      a.txnDate === b.txnDate ? a.id.localeCompare(b.id) : a.txnDate.localeCompare(b.txnDate),
    )

    const clustered = new Set<string>()
    for (const seed of sorted) {
      if (clustered.has(seed.id)) continue
      const members = [seed]
      for (const candidate of sorted) {
        if (candidate.id === seed.id || clustered.has(candidate.id)) continue
        if (members.every((m) => isNearDuplicate(m, candidate))) members.push(candidate)
      }
      if (members.length < 2) continue
      for (const m of members) clustered.add(m.id)
      groups.push(describeGroup(members))
    }
  }

  // Largest total exposure first: the same ordering rule the month-close finders
  // use, so a caller rendering both lists sees one consistent notion of "biggest".
  return groups.sort((a, b) => b.amount * b.txns.length - a.amount * a.txns.length)
}

/**
 * Rows already on record that a not-yet-saved draft would duplicate (§5.14).
 *
 * `excludeId` drops the row being edited — re-saving an unchanged transaction
 * must never warn that it duplicates itself.
 *
 * Returns matches; the decision to warn, and the user's acknowledgement, belong
 * to the caller. This never blocks or writes anything.
 */
export function findNearDuplicatesForDraft(
  draft: Omit<DuplicateCandidateTxn, 'id'>,
  existing: readonly DuplicateCandidateTxn[],
  options: { excludeId?: string | null } = {},
): DuplicateCandidateTxn[] {
  // A synthetic id that cannot collide with a persisted uuid, so the draft is
  // never mistaken for one of `existing` by the `excludeId` filter.
  const asTxn: DuplicateCandidateTxn = { ...draft, id: '\0draft' }
  return existing
    .filter((t) => t.id !== options.excludeId)
    .filter((t) => isNearDuplicate(asTxn, t))
    .sort((a, b) =>
      a.txnDate === b.txnDate ? a.id.localeCompare(b.id) : a.txnDate < b.txnDate ? -1 : 1,
    )
}
