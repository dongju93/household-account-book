/**
 * Shared month-close review capability (docs/4 §4.9, PR-14 / tracker S14).
 *
 * One loader behind two consumers that used to carry byte-for-byte copies:
 * the WebMCP `month_close_review` tool (`src/webmcp/useMonthCloseTools.ts`,
 * the browser agent pays) and the in-app narrative
 * (`src/ai/loadMonthCloseForNarrative.ts`, the provider pays). Both must
 * classify the same month identically — a divergence would mean the agent and
 * the in-app card disagree about what "needs checking" — so the rules live here
 * exactly once.
 *
 * Owns the materialize-before-read step (docs/2-2 invariant): callers never
 * read a month through any other path, so a stale screen window can never
 * produce under-counted findings.
 *
 * Viewers: `materialize_recurring` is a no-op for non-editors, so a successful
 * call proves nothing. If eligible recurring rows still have no occurrence
 * afterwards, the result is `ready: false` rather than an incomplete review
 * (a false clean review / under-counted budgets). Months an editor already
 * opened keep working for viewers.
 *
 * Returns a discriminated result instead of throwing: "not ready" is an
 * expected outcome, not a fault, and the two consumers surface it differently
 * (WebMCP returns it in the tool output; the in-app loader throws so
 * `useAsyncData` renders its error state). Each adapts at its own edge.
 */

import { listCategories } from '../../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../../data/recurring'
import { fetchTransactionsInRange, materializeMonth } from '../../data/summary'
import { computeAchievements } from '../../domain/achievement'
import {
  findMissingRecurringOccurrences,
  MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON,
  type MonthCloseFinding,
  reviewMonth,
} from '../../domain/monthClose'
import { monthKey, monthRange, type YearMonth } from '../../lib/month'

export interface MonthCloseReviewData {
  month: string
  needsCheck: MonthCloseFinding[]
  forReference: MonthCloseFinding[]
  noIssueSummary: { categoriesChecked: number; transactionsChecked: number }
  truncated: boolean
}

export type MonthCloseReviewResult =
  | { ready: true; review: MonthCloseReviewData }
  | { ready: false; reason: string }

export async function loadMonthCloseReview(
  ledgerId: string,
  ym: YearMonth,
  options: { canEdit: boolean },
): Promise<MonthCloseReviewResult> {
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

  // Incomplete materialization is a readiness failure, not a set of
  // `missing_recurring` findings — those canaries are only meaningful after an
  // editor-side materialize attempt.
  if (!options.canEdit && findMissingRecurringOccurrences(eligibleRecurring, txns, ym).length > 0) {
    return { ready: false, reason: MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON }
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
    ready: true,
    review: {
      month: monthKey(ym.year, ym.month),
      needsCheck,
      forReference,
      noIssueSummary: {
        categoriesChecked: activeCategories.length,
        transactionsChecked: txns.length,
      },
      truncated,
    },
  }
}
