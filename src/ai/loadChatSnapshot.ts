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
 * Mirrors the dashboard/reports aggregation path instead of importing the
 * WebMCP `qna_*` handlers — P1 chat depends on the minimal snapshot builder
 * only, and wrapping a tool's output would be the double path §4.9 forbids.
 */

import { listCategories } from '../data/categories'
import { fetchTransactionsInRange, materializeMonths } from '../data/summary'
import { computeAchievements } from '../domain/achievement'
import {
  categoryExpenseBreakdown,
  categoryMonthOverMonthDeltas,
  groupTransactionsByMonth,
  monthlyTrend,
} from '../domain/reports'
import { currentYearMonth, lastMonths, monthKey, monthWindowRange, todayISO } from '../lib/month'
import { buildChatSnapshot } from './buildChatSnapshot'
import { AI_LIMITS, type ChatSnapshot } from './types'

export async function loadChatSnapshot(ledgerId: string): Promise<ChatSnapshot> {
  const currentMonth = currentYearMonth()
  const months = lastMonths(currentMonth, AI_LIMITS.chatTurn.monthsMax)
  const { start, endExclusive } = monthWindowRange(currentMonth, months.length)

  await materializeMonths(ledgerId, months)
  const [txns, categories] = await Promise.all([
    fetchTransactionsInRange(ledgerId, start, endExclusive),
    listCategories(ledgerId),
  ])

  const byMonth = groupTransactionsByMonth(months, txns)
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
