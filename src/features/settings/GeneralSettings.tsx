import type { ReactNode } from 'react'

import { useLedger } from '../../auth/useLedger'
import { Card } from '../../ui'

// Currency is KRW-only for v1; custom month-start is deferred (spec §7.3), so we
// state the calendar-month rule instead of exposing a conflicting control.
export function GeneralSettings() {
  const { ledgerName } = useLedger()
  return (
    <section>
      <div className="mb-1.5 px-0.5 text-[12.5px] font-bold text-ink2">일반</div>
      <Card pad="p-0">
        <Row label="가계부" value={ledgerName ?? '내 가계부'} />
        <Row label="통화 단위" value="KRW ₩" last />
      </Card>
      <p className="mt-2 px-0.5 text-[11px] text-ink3">월 집계는 달력 월(1일~말일) 기준입니다.</p>
    </section>
  )
}

function Row({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <div
      className={`flex items-center justify-between px-3 py-2.5 ${last ? '' : 'border-b border-line-soft'}`}
    >
      <span className="text-sm font-semibold">{label}</span>
      <span className="text-[12.5px] text-ink2">{value}</span>
    </div>
  )
}
