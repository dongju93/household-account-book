import { won } from '../../lib/format'
import type { AchievementRow } from '../achievement'
import type { MonthSummary } from '../monthSummary'

/** Achievement fields needed for actionable tips. */
export type TipAchievement = Pick<
  AchievementRow,
  'name' | 'type' | 'status' | 'remaining' | 'target' | 'actual' | 'pct'
>

export type TipTopExpense = {
  name: string
  amount: number
  /** Share of total expense, 0–100. */
  pct: number
}

export interface SavingTipInput {
  period: 'current' | 'closed'
  summary: Pick<MonthSummary, 'balance' | 'totalIncome' | 'totalExpense' | 'totalSaving'>
  achievements: readonly TipAchievement[]
  /** Optional; when present, concentration tips can fire. */
  topExpenses?: readonly TipTopExpense[]
}

/**
 * Offline saving-tip candidates for the dashboard (pure domain, §5.11).
 *
 * Returns an ordered pool (priority first). The card shows one tip and advances
 * the pool on 「다시 생성」 so the action always changes something even when the
 * AI cache hits. Period-aware: closed months push next-month redesign; current
 * months focus on remaining-period control (and still surface overspend when
 * nothing adjustable remains).
 */
export function buildSavingTipTemplates(input: SavingTipInput): string[] {
  const overBudget = input.achievements
    .filter((a) => a.type === 'expense' && a.status === '초과' && a.target > 0)
    .sort((a, b) => a.remaining - b.remaining) // most overspent first (most negative remaining)

  const tips: string[] = []

  if (input.period === 'closed') {
    const worst = overBudget[0]
    if (worst) {
      tips.push(
        `이번 달 가장 큰 절약 필요 항목은 ${worst.name}입니다. 예산을 ${won(Math.abs(worst.remaining))} 초과했으므로 다음 달 한도를 우선 재조정하세요.`,
      )
      if (overBudget.length >= 2) {
        tips.push(
          `예산 초과 ${overBudget.length}곳 · 최대는 ${worst.name}(${won(Math.abs(worst.remaining))}). 초과 큰 항목부터 다음 달 한도를 다시 잡으세요.`,
        )
      }
    }

    const top = input.topExpenses?.find((row) => row.amount > 0)
    if (top) {
      tips.push(
        `이번 달 가장 큰 절약 후보는 ${top.name}(${won(top.amount)}, 지출의 ${top.pct}%)입니다. 다음 달 예산을 짤 때 이 항목의 한도를 먼저 점검하세요.`,
      )
    }

    if (input.summary.balance < 0) {
      tips.push(
        `수지 ${won(Math.abs(input.summary.balance))} 부족입니다. 다음 달에는 초과·상위 지출 한도를 먼저 고정한 뒤 나머지를 나누세요.`,
      )
    } else if (input.summary.balance > 0) {
      tips.push(
        `흑자 ${won(input.summary.balance)}이 남았습니다. 저축 목표에 일부를 배정하거나 다음 달 변동비 여유로 남길지 정하세요.`,
      )
    }

    return dedupeTips(tips)
  }

  // ── current month ────────────────────────────────────────────────────────
  const overBudgetNames = new Set(overBudget.map((row) => row.name))
  const adjustable = input.achievements
    .filter(
      (row) => row.type === 'expense' && row.target > 0 && row.actual > 0 && row.status !== '초과',
    )
    .sort((a, b) => {
      if (a.status !== b.status) return a.status === '주의' ? -1 : 1
      return b.pct - a.pct
    })

  const urgent = adjustable[0]
  if (urgent?.status === '주의') {
    tips.push(
      `남은 기간 가장 먼저 절약할 항목은 ${urgent.name}입니다. 예산이 ${won(urgent.remaining)} 남았으므로 추가 지출을 이 범위 안에서 관리하세요.`,
    )
  }

  const top = input.topExpenses?.find((row) => row.amount > 0 && !overBudgetNames.has(row.name))
  if (top) {
    tips.push(
      `남은 기간 절약 우선 항목은 ${top.name}(${won(top.amount)}, 지출의 ${top.pct}%)입니다. 이미 쓴 금액보다 추가 지출을 줄이는 데 집중하세요.`,
    )
  }

  if (urgent && urgent.status !== '주의') {
    tips.push(
      `남은 기간 절약 우선 항목은 ${urgent.name}입니다. 남은 예산 ${won(urgent.remaining)}을 넘지 않도록 추가 지출 한도를 유지하세요.`,
    )
  }

  // When every spent category is already over, still give an actionable overspend tip
  // (empty pool made 「다시 생성」 look broken).
  if (overBudget.length > 0) {
    const worst = overBudget[0]!
    if (overBudget.length === 1) {
      tips.push(
        `${worst.name} 예산을 ${won(Math.abs(worst.remaining))} 초과했습니다. 남은 기간 해당 지출을 멈추거나 설정에서 예산을 현실화하세요.`,
      )
    } else {
      tips.push(
        `예산 초과 ${overBudget.length}곳 · 최대는 ${worst.name}(${won(Math.abs(worst.remaining))}). 초과 큰 항목부터 한도를 다시 잡으세요.`,
      )
    }
  }

  if (input.summary.balance < 0) {
    tips.push(
      `수지 ${won(Math.abs(input.summary.balance))} 부족 · 변동 지출을 한 카테고리씩 줄이거나 수입·이체 누락이 없는지 확인하세요.`,
    )
  }

  return dedupeTips(tips)
}

/** Pick one tip from the pool by rotation index (wraps). Empty pool → empty. */
export function pickSavingTip(tips: readonly string[], rotation: number): string | null {
  if (tips.length === 0) return null
  const idx = ((rotation % tips.length) + tips.length) % tips.length
  return tips[idx] ?? null
}

function dedupeTips(tips: string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const t of tips) {
    if (seen.has(t)) continue
    seen.add(t)
    out.push(t)
  }
  return out
}
