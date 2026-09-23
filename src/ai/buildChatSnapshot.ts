/**
 * Domain aggregates → `ChatSnapshot` pure builder (docs/4 §5.4, PR-13 "minimal
 * snapshot builder"; tracker S12).
 *
 * Whitelist-maps every field so raw transactions, ids, and memos can never
 * reach the Edge payload, and fits the result under
 * `AI_LIMITS.chatTurn.contextMaxBytes` by shedding rows in a fixed priority
 * order. The count caps alone are not enough: forty 40-character Korean
 * category names serialize past 8 KiB by themselves, and the gateway rejects
 * an oversized snapshot as `validation` before any quota is claimed — so the
 * cap has to be enforced in bytes here, not assumed from item counts.
 *
 * Thin local helper on purpose (docs/4 §4.9): it takes the same domain outputs
 * the dashboard/reports compute and never re-wraps a WebMCP tool's output.
 */

import type { AchievementRow } from '../domain/achievement'
import type { CategoryBreakdownRow, CategoryDeltaRow, MonthlyTrendPoint } from '../domain/reports'
import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'
import { AI_LIMITS, type ChatSnapshot } from './types'

export interface ChatSnapshotSources {
  today: string
  currentMonth: YearMonth
  /** Oldest → newest; the last point must be `currentMonth`. */
  trend: readonly MonthlyTrendPoint[]
  /** Per-month breakdown sorted desc by `categoryExpenseBreakdown`. */
  breakdownByMonth: ReadonlyMap<string, readonly CategoryBreakdownRow[]>
  /** Current-month rows from `computeAchievements` (already filtered to target/actual > 0). */
  achievements: readonly AchievementRow[]
  /** From `categoryMonthOverMonthDeltas`; sorted by biggest increase first. */
  categoryChanges: readonly CategoryDeltaRow[]
}

/** Bytes as the Edge measures them: UTF-8 length of `JSON.stringify(context)`. */
export function chatSnapshotBytes(snapshot: ChatSnapshot): number {
  return new TextEncoder().encode(JSON.stringify(snapshot)).length
}

export function buildChatSnapshot(sources: ChatSnapshotSources): ChatSnapshot {
  const caps = AI_LIMITS.chatTurn
  const { today, currentMonth, trend, breakdownByMonth, achievements, categoryChanges } = sources

  const months = trend.slice(-caps.monthsMax).map((point) => ({
    month: point.month,
    income: point.totalIncome,
    expense: point.totalExpense,
    saving: point.totalSaving,
    investment: point.totalInvestment,
    balance: point.balance,
    topExpenses: (breakdownByMonth.get(point.month) ?? [])
      .slice(0, caps.topExpensesMax)
      .map((r) => ({ name: r.name, amount: r.amount, pct: r.pct })),
  }))

  const snapshot: ChatSnapshot = {
    today,
    currentMonth: monthKey(currentMonth.year, currentMonth.month),
    months,
    achievements: achievements.slice(0, caps.achievementsMax).map((a) => ({
      name: a.name,
      type: a.type,
      target: a.target,
      actual: a.actual,
      status: a.status,
    })),
    // Biggest absolute movers: a category that vanished matters as much as one
    // that doubled when the question is "what changed".
    categoryChanges: [...categoryChanges]
      .sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
      .slice(0, caps.categoryChangesMax)
      .map((c) => ({
        name: c.name,
        previousAmount: c.previousAmount,
        latestAmount: c.latestAmount,
        delta: c.delta,
        deltaPct: c.deltaPct,
      })),
    truncated:
      achievements.length > caps.achievementsMax ||
      categoryChanges.length > caps.categoryChangesMax ||
      trend.length > caps.monthsMax,
  }

  return fitChatSnapshot(snapshot, caps.contextMaxBytes)
}

/**
 * Shed rows until the snapshot serializes under `maxBytes`, least useful
 * first: achievements from the tail (the list is in category order, not
 * importance), then category changes, then per-month top expenses, then the
 * oldest months. The current month's totals are never dropped — a snapshot
 * that cannot answer "how much this month" is not worth sending. Any shedding
 * sets `truncated` so the prompt tells the model the list is partial.
 */
export function fitChatSnapshot(snapshot: ChatSnapshot, maxBytes: number): ChatSnapshot {
  let current = snapshot
  const over = () => chatSnapshotBytes(current) > maxBytes

  while (over() && current.achievements.length > 0) {
    current = { ...current, achievements: current.achievements.slice(0, -1), truncated: true }
  }
  while (over() && current.categoryChanges.length > 0) {
    current = { ...current, categoryChanges: current.categoryChanges.slice(0, -1), truncated: true }
  }
  while (over() && current.months.some((m) => m.topExpenses.length > 0)) {
    current = {
      ...current,
      months: current.months.map((m) => ({ ...m, topExpenses: m.topExpenses.slice(0, -1) })),
      truncated: true,
    }
  }
  while (over() && current.months.length > 1) {
    current = { ...current, months: current.months.slice(1), truncated: true }
  }
  return current
}
