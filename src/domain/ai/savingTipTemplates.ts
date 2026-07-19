import { won } from '../../lib/format'
import type { AchievementRow } from '../achievement'
import type { MonthSummary } from '../monthSummary'

/** Minimal achievement fields needed for template tips (avoids requiring full row shape). */
export type TipAchievement = Pick<AchievementRow, 'name' | 'type' | 'status' | 'remaining'>

export interface SavingTipInput {
  summary: Pick<MonthSummary, 'balance'>
  achievements: readonly TipAchievement[]
}

/**
 * Cross-category template tips for the dashboard (P0, pure domain, §5.11).
 *
 * Intentionally does **not** emit per-category daily-allowance copy — that lives
 * in `formatPaceHint` on AchievementList. Max 3 tips, fixed priority order.
 */
export function buildSavingTipTemplates(input: SavingTipInput): string[] {
  const tips: string[] = []

  const { balance } = input.summary
  if (balance < 0) {
    tips.push(`이번 달 수지가 ${won(Math.abs(balance))} 부족합니다.`)
  }

  const overBudget = input.achievements.filter((a) => a.type === 'expense' && a.status === '초과')
  if (overBudget.length > 0) {
    // remaining = target − actual; most overspent has the most negative remaining.
    const worst = overBudget.reduce((a, b) => (a.remaining <= b.remaining ? a : b))
    tips.push(`예산 초과 카테고리 ${overBudget.length}개 (최대 초과: ${worst.name}).`)
  }

  const nearGoal = input.achievements.filter((a) => a.type === 'saving' && a.status === '근접')
  if (nearGoal.length > 0) {
    const names = nearGoal
      .slice(0, 2)
      .map((a) => a.name)
      .join(', ')
    tips.push(`저축 목표에 가까운 항목: ${names}.`)
  }

  return tips.slice(0, 3)
}
