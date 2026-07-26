import type { AchievementRow } from '../../domain/achievement'

/**
 * 달성 확인 display ordering (docs/5. frontend-redesign-plan.md §6.3, §12-5).
 *
 * This is the *only* behavioural change the redesign is allowed to make, and it
 * is deliberately a display rule, not a domain calculation: it reads nothing but
 * fields `computeAchievements` already produced, adds no query, and drops no
 * row. Every row still renders, in one list, exactly as before — only the order
 * of the first few changes.
 *
 * The rule differs by month because the useful question differs:
 *
 * - Current month — the user can still act. Surface 지출 rows sitting at 주의
 *   that still have budget left (`remaining > 0`), highest `pct` first: those are
 *   the ones where slowing down this week still changes the outcome.
 * - Past month — nothing can be acted on, so the useful view is what actually
 *   went wrong. Surface 초과 지출 rows by size of the overshoot (`actual - target`).
 *
 * Rows outside the promoted group keep their existing relative order, so the
 * category ordering the user configured in 설정 still governs the rest of the list.
 */
export function orderAchievements(
  rows: readonly AchievementRow[],
  { isCurrentMonth }: { isCurrentMonth: boolean },
): AchievementRow[] {
  const isPromoted = isCurrentMonth
    ? (r: AchievementRow) => r.type === 'expense' && r.status === '주의' && r.remaining > 0
    : (r: AchievementRow) => r.type === 'expense' && r.status === '초과'

  const promoted: AchievementRow[] = []
  const rest: AchievementRow[] = []
  for (const row of rows) (isPromoted(row) ? promoted : rest).push(row)

  promoted.sort(
    isCurrentMonth
      ? (a, b) => b.pct - a.pct
      : (a, b) => b.actual - b.target - (a.actual - a.target),
  )

  return [...promoted, ...rest]
}
