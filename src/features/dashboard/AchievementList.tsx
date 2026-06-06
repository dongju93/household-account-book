import type { AchievementRow } from '../../domain/achievement'
import { fundTypeLabel } from '../../domain/fundType'
import { won } from '../../lib/format'
import { EmptyState, Progress, StatusPill } from '../../ui'
import { statusTone } from '../../ui/StatusPill'

export function AchievementList({ rows }: { rows: AchievementRow[] }) {
  return (
    <section>
      <div className="mb-1 flex items-center justify-between">
        <span className="text-[13.5px] font-bold">달성 확인</span>
        <span className="text-[12px] text-ink3">지출 예산 · 저축 목표만</span>
      </div>
      {rows.length === 0 ? (
        <EmptyState
          title="표시할 달성 항목이 없습니다"
          description="지출 예산이나 저축 목표를 설정하면 여기에 표시됩니다."
        />
      ) : (
        <div>
          {rows.map((r) => (
            <div key={r.categoryId} className="border-b border-line-soft py-2.5 last:border-b-0">
              <div className="mb-1.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <span className="text-[13px] font-bold">{r.name}</span>
                  <span className="text-[10.5px] font-semibold text-ink3">{fundTypeLabel(r.type)}</span>
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
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
