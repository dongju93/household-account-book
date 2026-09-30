/**
 * In-app adapter + Edge-input builder for the month-close narrative
 * (docs/4 §5.5, PR-7 / tracker S07).
 *
 * The load itself (materialize → recurring/skips → txns → `reviewMonth`, with
 * the viewer fail-closed rule) lives in the shared capability
 * `capabilities/monthClose.ts`, which the WebMCP `month_close_review` tool also
 * uses (tracker S14). This file only adapts it for `useAsyncData`: a
 * not-ready result is thrown so the section renders its error state.
 */

import type { MonthCloseFinding } from '../domain/monthClose'
import type { YearMonth } from '../lib/month'
import { loadMonthCloseReview, type MonthCloseReviewData } from './capabilities/monthClose'
import { AI_LIMITS, type MonthCloseNarrativeInput } from './types'

export type { MonthCloseReviewData }

export async function loadMonthCloseForNarrative(
  ledgerId: string,
  ym: YearMonth,
  options: { canEdit: boolean },
): Promise<MonthCloseReviewData> {
  const result = await loadMonthCloseReview(ledgerId, ym, options)
  if (!result.ready) throw new Error(result.reason)
  return result.review
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
