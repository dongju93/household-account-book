import { useState } from 'react'

import { useAiSettings } from '../../ai/useAiSettings'
import { useAuth } from '../../auth/useAuth'
import { setInAppAiEnabled } from '../../data/aiSettings'
import { describeError } from '../../data/errors'
import { Card, ErrorBanner, LoadingState, SectionHeader, Toggle } from '../../ui'

/**
 * 인앱 AI (docs/5. frontend-redesign-plan.md §6.7, fourth section).
 *
 * PR-8 / S04 privacy gate: disclosure plus a server-backed opt-out. The
 * disclosure wording and the toggle behaviour are unchanged by the redesign —
 * §6.7 only allows the type hierarchy to improve, so the disclosure now reads as
 * body text under a caption-level label instead of competing with the control.
 * Residual daily/monthly quota digits belong to S13 (PR-17), not here.
 */
export function InAppAiSettings() {
  const { user } = useAuth()
  const userId = user?.id
  // The shared session copy, so flipping the toggle here reaches the dashboard
  // cards and the transaction sheet immediately — previously `reload()` only
  // refreshed this screen's own fetch and the other surfaces stayed live until a
  // full page reload.
  const { settings: data, loading, error, reload } = useAiSettings()
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
    <section className="flex flex-col gap-2">
      <SectionHeader title="인앱 AI" />
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
            <div className="flex flex-col gap-1 border-b border-line-soft px-3 py-3">
              <p className="text-caption font-semibold text-ink2">처리 고지</p>
              <p className="text-body text-ink2 text-pretty">{AI_DISCLOSURE}</p>
            </div>
            <div className="flex min-h-14 items-center justify-between gap-3 px-3 py-3">
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">인앱 AI 사용</p>
                <p className="text-caption mt-0.5 text-ink2 text-pretty">
                  끄면 AI 기능이 숨겨지고 서버에서도 거부됩니다.
                </p>
              </div>
              <Toggle
                on={data.inAppAiEnabled}
                onChange={onToggle}
                disabled={saving}
                label="인앱 AI 사용"
              />
            </div>
          </>
        )}
      </Card>
      {actionError && <ErrorBanner message={actionError} />}
      <p className="text-caption text-ink2 text-pretty">
        처리 목적·보관·국외 이전 세부 사항은 개인정보 처리방침을 따릅니다. (링크는 public 공개 전
        반영 권장)
      </p>
    </section>
  )
}

/** Exposed for tests — must stay user-facing and present whenever the AI settings block is shown. */
export const AI_DISCLOSURE =
  '인앱 AI를 사용하면 거래 초안·월간 인사이트 등 요청에 필요한 입력·집계 정보가 제공자 LLM(OpenAI, 국외)으로 전송·처리될 수 있습니다. 원장 저장은 사용자가 확인한 뒤에만 이뤄지며, 인사이트 캐시는 최대 약 7일 보관될 수 있습니다. 원하지 않으면 아래에서 끌 수 있습니다.'
