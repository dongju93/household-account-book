import { useState } from 'react'

import type { FuzzyDuplicateGroup } from '../../domain/fuzzyDuplicates'
import { won } from '../../lib/format'
import { formatDayHeader } from '../../lib/month'

/**
 * "의심 중복 N건" over the transactions currently loaded (§5.7).
 *
 * Label only, by design: it names what looks repeated and stops there. There is
 * no delete, no merge, and no bulk action — a false positive here must cost the
 * user a glance, never a row. Opening a listed group's row for review is done
 * the way it always was, by tapping it in the list below.
 *
 * The count describes the rows fetched so far, not the whole month: the list is
 * keyset-paginated, so the copy says 불러온 내역 rather than implying a complete scan.
 */
export function DuplicateSuspectBanner({
  groups,
  categoryNameById,
}: {
  groups: FuzzyDuplicateGroup[]
  categoryNameById: ReadonlyMap<string, string>
}) {
  const [expanded, setExpanded] = useState(false)
  if (groups.length === 0) return null

  return (
    <div className="flex flex-col gap-2 rounded-surface border border-status-warning/35 bg-status-warning/8 px-3 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <p className="text-caption font-semibold text-status-warning">
          불러온 내역에서 중복이 의심되는 거래 {groups.length}건이 있습니다.
        </p>
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="pressable text-caption flex-none rounded-control px-1.5 font-semibold text-status-warning underline underline-offset-2"
        >
          {expanded ? '접기' : '보기'}
        </button>
      </div>
      {expanded && (
        <ul className="text-caption flex flex-col gap-1 text-ink2">
          {groups.map((g) => (
            <li key={`${g.categoryId}:${g.amount}:${g.txns[0].id}`} className="text-pretty">
              <span className="tnum">
                {g.firstDate === g.lastDate
                  ? formatDayHeader(g.firstDate)
                  : `${formatDayHeader(g.firstDate)}~${formatDayHeader(g.lastDate)}`}
              </span>{' '}
              · {categoryNameById.get(g.categoryId) ?? '카테고리'} ·{' '}
              <span className="tnum">{won(g.amount)}</span> · {g.txns.length}건
              {g.sharedMemo ? ` · ${g.sharedMemo}` : ''}
            </li>
          ))}
        </ul>
      )}
      <p className="text-caption text-ink2">
        자동으로 삭제하거나 합치지 않습니다. 직접 확인한 뒤 필요한 거래만 수정하세요.
      </p>
    </div>
  )
}
