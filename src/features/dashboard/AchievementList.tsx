import type { AchievementRow } from '../../domain/achievement'
import type { BudgetPaceRow } from '../../domain/budgetPace'
import { formatPaceHint } from '../../domain/budgetPace'
import { fundTypeLabel } from '../../domain/fundType'
import { won } from '../../lib/format'
import { EmptyState, Progress, SectionHeader, StatusPill } from '../../ui'
import { statusTone } from '../../ui/statusTone'
import { orderAchievements } from './orderAchievements'

/**
 * 달성 확인 (§6.3, 3번).
 *
 * Every row the domain produced still renders, in one list — no top-3 summary,
 * no filtering. What changed is hierarchy and order: rows are separated by rules
 * rather than wrapped in cards (§4.3), and `orderAchievements` puts the rows the
 * user can still do something about first (§6.3 현재 월 / 과거 월).
 */
export function AchievementList({
  rows,
  paceByCategoryId,
  isCurrentMonth,
}: {
  rows: AchievementRow[]
  paceByCategoryId?: ReadonlyMap<string, BudgetPaceRow>
  /** Drives both the pace hint and the §6.3 ordering rule. */
  isCurrentMonth?: boolean
}) {
  const ordered = orderAchievements(rows, { isCurrentMonth: isCurrentMonth === true })

  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="달성 확인" aside="지출 예산 · 저축 목표" />
      {ordered.length === 0 ? (
        <EmptyState
          title="표시할 달성 항목이 없습니다"
          description="지출 예산이나 저축 목표를 설정하면 여기에 표시됩니다."
        />
      ) : (
        <ul className="flex flex-col">
          {ordered.map((r) => {
            const pace =
              isCurrentMonth && r.type === 'expense' && r.target > 0
                ? paceByCategoryId?.get(r.categoryId)
                : undefined
            const paceHint = pace ? formatPaceHint(pace) : null // only opted-in categories

            // A target of 0 covers both "no budget set" and "a budget of exactly
            // 0" — `computeAchievements` collapses them via `budgetAmount ?? 0`.
            // A percentage against a zero target is undefined, so `pctOf` guards
            // it to 0; printing that as "0%" beside an 초과 pill and an empty
            // gauge reads as a contradiction (약국/병원 ₩18,000 / ₩0 → 초과 0%).
            // Name the missing target and let the gauge follow the status
            // instead. The calculations themselves are untouched (§12).
            const hasTarget = r.target > 0
            const missingTargetLabel = r.type === 'expense' ? '예산 없음' : '목표 없음'

            return (
              <li
                key={r.categoryId}
                className="flex flex-col gap-2 border-b border-line-soft py-3 last:border-b-0"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="flex min-w-0 items-baseline gap-1.5">
                    <span className="text-section truncate text-ink">{r.name}</span>
                    <span className="text-caption flex-none text-ink2">
                      {fundTypeLabel(r.type)}
                    </span>
                  </span>
                  <StatusPill status={r.status} />
                </div>
                <Progress
                  pct={hasTarget ? r.pct : r.actual > 0 ? 100 : 0}
                  tone={statusTone(r.status)}
                />
                <div className="flex items-baseline justify-between gap-2">
                  <span className="tnum text-caption text-ink2">
                    {won(r.actual)} / {hasTarget ? won(r.target) : missingTargetLabel}
                  </span>
                  <span className="tnum text-caption font-semibold text-ink">
                    {hasTarget ? `${r.pct}%` : '—'}
                  </span>
                </div>
                {paceHint && <p className="tnum text-caption text-ink2">{paceHint}</p>}
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
