import type { AchievementRow } from '../../domain/achievement'
import type { BudgetPaceRow } from '../../domain/budgetPace'
import { formatPaceHint } from '../../domain/budgetPace'
import { fundTypeLabel } from '../../domain/fundType'
import { won } from '../../lib/format'
import { EmptyState, Progress, StatusPill } from '../../ui'
import { statusTone } from '../../ui/statusTone'

export function AchievementList({
  rows,
  paceByCategoryId,
  showPace,
}: {
  rows: AchievementRow[]
  paceByCategoryId?: ReadonlyMap<string, BudgetPaceRow>
  /** Show daily-allowance hints only for the in-progress month. */
  showPace?: boolean
}) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13.5px] font-bold">달성 확인</span>
        <span className="text-[12px] text-ink3">지출 예산 · 저축 목표</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="표시할 달성 항목이 없습니다"
          description="지출 예산이나 저축 목표를 설정하면 여기에 표시됩니다."
        />
      ) : (
        <div>
          {rows.map((r) => {
            const pace =
              showPace && r.type === 'expense' && r.target > 0
                ? paceByCategoryId?.get(r.categoryId)
                : undefined
            const paceHint = pace ? formatPaceHint(pace) : null // only opted-in categories

            return (
              <div key={r.categoryId} className="border-b border-line-soft py-2.5 last:border-b-0">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <span className="text-[13px] font-bold">{r.name}</span>
                    <span className="text-[10.5px] font-semibold text-ink3">
                      {fundTypeLabel(r.type)}
                    </span>
                  </span>
                  <StatusPill status={r.status} />
                </div>
                <Progress pct={r.pct} tone={statusTone(r.status)} />
                <div className="mt-1.5 flex items-center justify-between">
                  <span className="tnum text-[11px] text-ink2">
                    {won(r.actual)} / {won(r.target)}
                  </span>
                  <span className="text-[11px] font-bold" style={{ color: 'inherit' }}>
                    {r.pct}%
                  </span>
                </div>
                {paceHint && <p className="tnum mt-1 text-[11px] text-ink3">{paceHint}</p>}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
