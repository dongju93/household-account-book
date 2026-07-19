import type { ReactNode } from 'react'
import { useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useAuth } from '../../auth/useAuth'
import { useLedger } from '../../auth/useLedger'
import { getAiUserSettings, setInAppAiEnabled } from '../../data/aiSettings'
import { describeError } from '../../data/errors'
import { Card, ErrorBanner, LoadingState, Toggle } from '../../ui'

// Currency is KRW-only for v1; custom month-start is deferred (spec §7.3), so we
// state the calendar-month rule instead of exposing a conflicting control.
//
// AI block: PR-8 / S04 privacy gate — disclosure + server-backed opt-out.
// Residual daily/monthly quota digits belong to S13 (PR-17), not here.
export function GeneralSettings() {
  const { ledgerName } = useLedger()
  return (
    <section className="flex flex-col gap-5">
      <div>
        <div className="mb-1.5 px-0.5 text-[12.5px] font-bold text-ink2">일반</div>
        <Card pad="p-0">
          <Row label="가계부" value={ledgerName ?? '내 가계부'} />
          <Row label="통화 단위" value="KRW ₩" last />
        </Card>
        <p className="mt-2 px-0.5 text-[11px] text-ink3">월 집계는 달력 월(1일~말일) 기준입니다.</p>
      </div>

      <InAppAiSettings />
    </section>
  )
}

function InAppAiSettings() {
  const { user } = useAuth()
  const userId = user?.id
  const { data, loading, error, reload } = useAsyncData(
    () => (userId ? getAiUserSettings(userId) : Promise.reject(new Error('로그인이 필요합니다.'))),
    [userId],
  )
  const [saving, setSaving] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  async function onToggle(next: boolean) {
    if (!userId || saving) return
    setSaving(true)
    setActionError(null)
    try {
      await setInAppAiEnabled(userId, next)
      reload()
    } catch (err) {
      setActionError(describeError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <div className="mb-1.5 px-0.5 text-[12.5px] font-bold text-ink2">인앱 AI</div>
      <Card pad="p-0">
        {loading && (
          <div className="px-3 py-4">
            <LoadingState label="AI 설정 불러오는 중…" />
          </div>
        )}
        {error && (
          <div className="p-3">
            <ErrorBanner
              message={error.message}
              variant={error.permission ? 'permission' : 'error'}
            />
          </div>
        )}
        {!loading && !error && data && (
          <>
            <div className="border-b border-line-soft px-3 py-2.5">
              <p className="text-[12px] leading-relaxed text-ink2">{AI_DISCLOSURE}</p>
            </div>
            <div className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="text-sm font-semibold">인앱 AI 사용</div>
                <p className="mt-0.5 text-[11px] text-ink3">
                  끄면 AI 기능이 숨겨지고 서버에서도 거부됩니다.
                </p>
              </div>
              <Toggle on={data.inAppAiEnabled} onChange={onToggle} disabled={saving} />
            </div>
          </>
        )}
      </Card>
      {actionError && (
        <div className="mt-2">
          <ErrorBanner message={actionError} />
        </div>
      )}
      <p className="mt-2 px-0.5 text-[11px] text-ink3">
        처리 목적·보관·국외 이전 세부 사항은 개인정보 처리방침을 따릅니다. (링크는 public 공개 전
        반영 권장)
      </p>
    </div>
  )
}

/** Exposed for tests — must stay user-facing and present whenever the AI settings block is shown. */
export const AI_DISCLOSURE =
  '인앱 AI를 사용하면 거래 초안·월간 인사이트 등 요청에 필요한 입력·집계 정보가 제공자 LLM(xAI, 국외)으로 전송·처리될 수 있습니다. 원장 저장은 사용자가 확인한 뒤에만 이뤄지며, 인사이트 캐시는 최대 약 7일 보관될 수 있습니다. 원하지 않으면 아래에서 끌 수 있습니다.'

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
