import type { ReactNode } from 'react'

import { useLedger } from '../../auth/useLedger'
import { Card, SectionHeader } from '../../ui'

/**
 * 가계부 일반 (docs/5. frontend-redesign-plan.md §6.7, first section).
 *
 * Currency is KRW-only for v1 and a custom month-start is deferred, so we state
 * the calendar-month rule instead of exposing a control that would contradict it.
 *
 * The 인앱 AI block used to live in this file. §6.7 orders the screen
 * 가계부 일반 → 카테고리 → 고정 항목 → 인앱 AI → 계정, which puts two managed
 * lists between the two, so it now lives in `InAppAiSettings.tsx`.
 */
export function GeneralSettings() {
  const { ledgerName } = useLedger()
  return (
    <section className="flex flex-col gap-2">
      <SectionHeader title="가계부 일반" />
      <Card pad="p-0">
        <Row label="가계부" value={ledgerName ?? '내 가계부'} />
        <Row label="통화 단위" value="KRW ₩" last />
      </Card>
      <p className="text-caption text-ink2">월 집계는 달력 월(1일~말일) 기준입니다.</p>
    </section>
  )
}

function Row({ label, value, last }: { label: string; value: ReactNode; last?: boolean }) {
  return (
    <div
      className={`flex min-h-12 items-center justify-between gap-3 px-3 py-2.5 ${last ? '' : 'border-b border-line-soft'}`}
    >
      <span className="text-body font-semibold text-ink">{label}</span>
      <span className="text-body text-ink2">{value}</span>
    </div>
  )
}
