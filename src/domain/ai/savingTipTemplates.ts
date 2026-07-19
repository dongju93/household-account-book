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
  summary: Pick<MonthSummary, 'balance' | 'totalIncome' | 'totalExpense' | 'totalSaving'>
  achievements: readonly TipAchievement[]
  /** Optional; when present, concentration tips can fire. */
  topExpenses?: readonly TipTopExpense[]
}

/**
 * Cross-category actionable tips for the dashboard (pure domain, §5.11 upgraded).
 *
 * JTBD: concrete next steps with numbers — not a restatement of SummaryCards.
 * Intentionally does **not** emit per-category “남은 N일 · 하루 ₩X” copy — that
 * lives in `formatPaceHint` on AchievementList. Max 3 tips, priority order.
 */
export function buildSavingTipTemplates(input: SavingTipInput): string[] {
  const tips: string[] = []
  const { balance, totalIncome, totalExpense, totalSaving } = input.summary

  const overBudget = input.achievements
    .filter((a) => a.type === 'expense' && a.status === '초과' && a.target > 0)
    .sort((a, b) => a.remaining - b.remaining) // most overspent first (most negative remaining)

  const attention = input.achievements
    .filter((a) => a.type === 'expense' && a.status === '주의' && a.target > 0)
    .sort((a, b) => b.pct - a.pct)

  const nearGoal = input.achievements
    .filter((a) => a.type === 'saving' && a.status === '근접' && a.remaining > 0)
    .sort((a, b) => a.remaining - b.remaining)

  const laggingSaving = input.achievements
    .filter((a) => a.type === 'saving' && a.status === '진행중' && a.target > 0 && a.remaining > 0)
    .sort((a, b) => b.remaining - a.remaining)

  // ── 1) Red: negative balance ─────────────────────────────────────────────
  if (balance < 0) {
    const deficit = Math.abs(balance)
    const worst = overBudget[0]
    if (worst) {
      const overBy = Math.abs(worst.remaining)
      tips.push(
        `수지 ${won(deficit)} 부족 · ${worst.name} 초과분 ${won(overBy)}을 먼저 줄이면 적자 상당 부분을 메울 수 있습니다.`,
      )
    } else {
      tips.push(
        `수지 ${won(deficit)} 부족 · 변동 지출을 한 카테고리씩 줄이거나, 수입·이체 누락이 없는지 확인하세요.`,
      )
    }
  }

  // ── 2) Over-budget (when not already covered as the deficit tip's focus) ─
  if (overBudget.length > 0 && tips.length < 3) {
    const worst = overBudget[0]!
    const overBy = Math.abs(worst.remaining)
    // Avoid near-duplicate of tip #1 which already named this category + amount.
    const alreadyCovered =
      balance < 0 &&
      tips.length > 0 &&
      tips[0]!.includes(worst.name) &&
      tips[0]!.includes(won(overBy))
    if (!alreadyCovered) {
      if (overBudget.length === 1) {
        tips.push(
          `${worst.name} 예산을 ${won(overBy)} 초과했습니다. 남은 기간 해당 지출을 멈추거나 설정에서 예산을 현실화하세요.`,
        )
      } else {
        tips.push(
          `예산 초과 ${overBudget.length}곳 · 최대는 ${worst.name}(${won(overBy)}). 초과 큰 항목부터 한도를 다시 잡으세요.`,
        )
      }
    } else if (overBudget.length >= 2) {
      const second = overBudget[1]!
      tips.push(
        `이어서 ${second.name}도 ${won(Math.abs(second.remaining))} 초과 · 초과 항목을 2곳 이상 동시에 줄이면 수지 회복이 빠릅니다.`,
      )
    }
  }

  // ── 3) Attention (주의) before month-end overrun ─────────────────────────
  if (tips.length < 3 && attention.length > 0 && overBudget.length === 0) {
    const row = attention[0]!
    tips.push(
      `${row.name} 예산을 이미 ${row.pct}% 사용했습니다. 월말 전 한도를 넘기지 않도록 남은 지출을 계획하세요.`,
    )
  }

  // ── 4) Near-goal saving: close the gap with a number ─────────────────────
  if (tips.length < 3 && nearGoal.length > 0) {
    const row = nearGoal[0]!
    tips.push(
      `${row.name} 목표까지 ${won(row.remaining)} · 이번 달 잔여에서 우선 배정하면 달성에 가깝습니다.`,
    )
  }

  // ── 5) Black surplus but lagging savings goals ───────────────────────────
  if (tips.length < 3 && balance > 0 && laggingSaving.length > 0) {
    const row = laggingSaving[0]!
    const assign = Math.min(balance, row.remaining)
    tips.push(
      `흑자 ${won(balance)} 중 ${won(assign)}을 ${row.name}에 배정하면 목표 진척이 눈에 띕니다.`,
    )
  }

  // ── 6) Expense concentration (top category dominates) ────────────────────
  const top = input.topExpenses?.[0]
  if (tips.length < 3 && top && top.pct >= 35 && top.amount > 0) {
    tips.push(
      `지출의 ${top.pct}%가 ${top.name}(${won(top.amount)})에 몰려 있습니다. 한도·절감 효과가 가장 큰 축입니다.`,
    )
  }

  // ── 7) High spend rate vs income (only when no stronger signal) ──────────
  if (
    tips.length < 3 &&
    totalIncome > 0 &&
    totalExpense > 0 &&
    overBudget.length === 0 &&
    balance >= 0
  ) {
    const spendPct = Math.round((totalExpense / totalIncome) * 100)
    if (spendPct >= 70) {
      tips.push(
        `지출이 소득의 약 ${spendPct}%입니다. 상위 지출 카테고리에 월 한도를 두면 저축 여력이 남습니다.`,
      )
    }
  }

  // ── 8) Healthy month: convert surplus into a habit (last resort) ─────────
  if (tips.length === 0 && balance > 0) {
    if (totalSaving > 0) {
      tips.push(
        `흑자 ${won(balance)} · 이미 저축 ${won(totalSaving)}을 넣고 있습니다. 흑자분을 자동 이체로 고정하면 페이스가 유지됩니다.`,
      )
    } else {
      tips.push(
        `흑자 ${won(balance)} · 일부를 저축·투자 자동 이체로 빼 두면 다음 달 변동 지출에 덜 흔들립니다.`,
      )
    }
  }

  return tips.slice(0, 3)
}
