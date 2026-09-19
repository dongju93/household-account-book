/**
 * Dedicated loader for the chat sheet's read-only snapshot (docs/4 §5.4,
 * tracker S12).
 *
 * The sheet is global (mounted in `AppLayout`), so it cannot borrow a screen's
 * already-loaded data; it fetches its own window and, like
 * `loadMonthCloseForNarrative`, owns the materialize-before-read step so a
 * month no screen has opened yet never produces under-counted totals
 * (docs/2-2 invariant). `materialize_recurring` is idempotent per month, so
 * re-running it for a window the dashboard already covered is cheap.
 *
 * Viewers: `materialize_recurring` is a no-op for non-editors (returns 0
 * rather than raising), so a successful call proves nothing. `chat_turn` is
 * viewer-level, and the snapshot is sent to the model as authoritative
 * figures — a month no editor has opened would otherwise reach it with
 * recurring expenses silently absent. If any month in the window still has
 * eligible recurring items without an occurrence after the call, fail closed
 * instead of building the snapshot. Months an editor already opened keep
 * working for viewers.
 *
 * Mirrors the dashboard/reports aggregation path instead of importing the
 * WebMCP `qna_*` handlers — P1 chat depends on the minimal snapshot builder
 * only, and wrapping a tool's output would be the double path §4.9 forbids.
 */

import { listCategories } from '../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../data/recurring'
import { fetchTransactionsInRange, materializeMonths } from '../data/summary'
import { computeAchievements } from '../domain/achievement'
import { findMissingRecurringOccurrences } from '../domain/monthClose'
import {
  categoryExpenseBreakdown,
  categoryMonthOverMonthDeltas,
  groupTransactionsByMonth,
  monthlyTrend,
} from '../domain/reports'
import type { Transaction } from '../domain/types'
import {
  currentYearMonth,
  lastMonths,
  monthKey,
  monthWindowRange,
  todayISO,
  type YearMonth,
} from '../lib/month'
import { buildChatSnapshot } from './buildChatSnapshot'
import { AI_LIMITS, type ChatSnapshot } from './types'

/**
 * Thrown for viewers when the snapshot window is not fully materialized.
 * Distinct from `MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON` because that one
 * names a single month; the chat window spans several.
 */
export const CHAT_SNAPSHOT_MATERIALIZE_INCOMPLETE_REASON =
  '최근 몇 달의 고정 항목이 아직 반영되지 않았습니다. 편집 권한이 있는 구성원이 해당 월을 연 뒤 다시 시도해 주세요.'

export async function loadChatSnapshot(
  ledgerId: string,
  options: { canEdit: boolean },
): Promise<ChatSnapshot> {
  const currentMonth = currentYearMonth()
  const months = lastMonths(currentMonth, AI_LIMITS.chatTurn.monthsMax)
  const { start, endExclusive } = monthWindowRange(currentMonth, months.length)

  await materializeMonths(ledgerId, months)
  const [txns, categories] = await Promise.all([
    fetchTransactionsInRange(ledgerId, start, endExclusive),
    listCategories(ledgerId),
  ])

  const byMonth = groupTransactionsByMonth(months, txns)

  if (!options.canEdit) {
    await assertWindowMaterialized(ledgerId, months, byMonth)
  }

  const activeCategories = categories.filter((c) => c.isActive)
  const currentTxns = byMonth.get(monthKey(currentMonth.year, currentMonth.month)) ?? []

  return buildChatSnapshot({
    today: todayISO(),
    currentMonth,
    trend: monthlyTrend(byMonth),
    breakdownByMonth: new Map(
      [...byMonth].map(([month, rows]) => [month, categoryExpenseBreakdown(categories, rows)]),
    ),
    // Same filter as the dashboard: rows with neither a target nor spend are noise.
    achievements: computeAchievements(activeCategories, currentTxns).filter(
      (r) => r.target > 0 || r.actual > 0,
    ),
    categoryChanges: categoryMonthOverMonthDeltas(categories, byMonth),
  })
}

/**
 * Viewer-only readiness canary, run *after* the materialize attempt: an
 * active, non-skipped recurring item with no occurrence in a month means no
 * editor has opened that month yet. Skips are month-scoped, so each month
 * needs its own `recurring_skips` set — a skip in one month must not hide a
 * genuinely missing occurrence in another.
 */
async function assertWindowMaterialized(
  ledgerId: string,
  months: readonly YearMonth[],
  byMonth: ReadonlyMap<string, Transaction[]>,
): Promise<void> {
  const [recurringItems, skippedByMonth] = await Promise.all([
    listRecurring(ledgerId),
    Promise.all(months.map((ym) => listSkippedRecurringIds(ledgerId, ym))),
  ])

  const incomplete = months.some((ym, i) => {
    const skipped = skippedByMonth[i]
    const eligible = recurringItems.filter((r) => !skipped.has(r.id))
    const monthTxns = byMonth.get(monthKey(ym.year, ym.month)) ?? []
    return findMissingRecurringOccurrences(eligible, monthTxns, ym).length > 0
  })
  if (incomplete) {
    throw new Error(CHAT_SNAPSHOT_MATERIALIZE_INCOMPLETE_REASON)
  }
}
