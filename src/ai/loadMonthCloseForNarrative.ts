/**
 * Dedicated loader + Edge-input builder for the month-close narrative
 * (docs/4 §5.5, PR-7 / tracker S07).
 *
 * Mirrors the WebMCP `loadMonthCloseReview` flow on purpose instead of
 * importing it: P0/P0.5 keeps in-app AI on thin local helpers and defers the
 * shared-capability extraction (with behavior-equivalence tests) to PR-14 —
 * see docs/4 §4.9. The Dashboard's own loader (categories + trend txns) is not
 * enough here: `reviewMonth` also needs recurring items and skips, and the
 * materialize-before-read step must be owned by this loader so a stale screen
 * window can never produce under-counted findings (docs/2-2 invariant).
 *
 * Viewers: `materialize_recurring` is a no-op for non-editors. If eligible
 * recurring rows still have no occurrence after that call, fail closed rather
 * than returning an incomplete review (false clean / under-counted budgets).
 * Already-materialized months (an editor opened them earlier) still work for
 * viewers — min Edge role stays `viewer`.
 */

import { listCategories } from '../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../data/recurring'
import { fetchTransactionsInRange, materializeMonth } from '../data/summary'
import { computeAchievements } from '../domain/achievement'
import {
  findMissingRecurringOccurrences,
  MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON,
  type MonthCloseFinding,
  reviewMonth,
} from '../domain/monthClose'
import { monthKey, monthRange, type YearMonth } from '../lib/month'
import { AI_LIMITS, type MonthCloseNarrativeInput } from './types'

export interface MonthCloseReviewData {
  month: string
  needsCheck: MonthCloseFinding[]
  forReference: MonthCloseFinding[]
  noIssueSummary: { categoriesChecked: number; transactionsChecked: number }
  truncated: boolean
}

export async function loadMonthCloseForNarrative(
  ledgerId: string,
  ym: YearMonth,
  options: { canEdit: boolean },
): Promise<MonthCloseReviewData> {
  await materializeMonth(ledgerId, ym)

  const range = monthRange(ym.year, ym.month)
  const [recurringItems, categories, txns, skippedRecurringIds] = await Promise.all([
    listRecurring(ledgerId),
    listCategories(ledgerId),
    fetchTransactionsInRange(ledgerId, range.start, range.endExclusive),
    listSkippedRecurringIds(ledgerId, ym),
  ])

  // A deliberate skip for `ym` was never supposed to materialize — drop it so
  // `findMissingRecurringOccurrences` can't read it as a materialization bug.
  const eligibleRecurring = recurringItems.filter((r) => !skippedRecurringIds.has(r.id))

  // Viewers cannot insert recurring occurrences. Incomplete materialization is
  // a readiness failure, not a set of `missing_recurring` findings — those
  // canaries are only meaningful after an editor-side materialize attempt.
  if (!options.canEdit && findMissingRecurringOccurrences(eligibleRecurring, txns, ym).length > 0) {
    throw new Error(MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON)
  }

  const activeCategories = categories.filter((c) => c.isActive)
  const achievements = computeAchievements(activeCategories, txns).filter(
    (r) => r.target > 0 || r.actual > 0,
  )

  const { needsCheck, forReference, truncated } = reviewMonth({
    recurringItems: eligibleRecurring,
    txns,
    categories,
    achievements,
    ym,
  })

  return {
    month: monthKey(ym.year, ym.month),
    needsCheck,
    forReference,
    noIssueSummary: {
      categoriesChecked: activeCategories.length,
      transactionsChecked: txns.length,
    },
    truncated,
  }
}

/**
 * Whitelist-maps the review into the Edge payload: `{kind, label}` only —
 * `nav` (categoryId, memo search hints) and raw transactions never leave the
 * client (spec §5.5 "findings only"). Caps at `AI_LIMITS.monthCloseNarrative`
 * (needsCheck first) and folds any cap-drop into `truncated` so the model
 * knows the list is partial.
 */
export function buildMonthCloseNarrativeInput(
  review: MonthCloseReviewData,
): MonthCloseNarrativeInput {
  const cap = AI_LIMITS.monthCloseNarrative.findingsMax
  const needsCheck = review.needsCheck.slice(0, cap).map(toEdgeFinding)
  const forReference = review.forReference
    .slice(0, Math.max(0, cap - needsCheck.length))
    .map(toEdgeFinding)
  const cappedHere =
    needsCheck.length + forReference.length < review.needsCheck.length + review.forReference.length

  return {
    month: review.month,
    needsCheck,
    forReference,
    truncated: review.truncated || cappedHere,
  }
}

function toEdgeFinding(f: MonthCloseFinding): { kind: string; label: string } {
  return { kind: f.kind, label: f.label }
}
