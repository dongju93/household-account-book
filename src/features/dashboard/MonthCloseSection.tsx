import { useState } from 'react'

import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { dataVersionHash, stableStringify } from '../../ai/hash'
import {
  buildMonthCloseNarrativeInput,
  loadMonthCloseForNarrative,
} from '../../ai/loadMonthCloseForNarrative'
import type { MonthCloseNarrativeResult } from '../../ai/types'
import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { useAuth } from '../../auth/useAuth'
import { getAiUserSettings } from '../../data/aiSettings'
import { describeError } from '../../data/errors'
import type { MonthCloseFinding } from '../../domain/monthClose'
import { currentYearMonth, type YearMonth } from '../../lib/month'

/**
 * 월 마감 점검 접이식 섹션 (S07 / PR-7, spec §5.5).
 *
 * Past months only — month close is a look-back, so the in-progress month never
 * shows it (same default as the WebMCP `month_close_review` tool). Collapsed by
 * default; expanding runs the dedicated loader (materialize → recurring/skips →
 * txns → `reviewMonth`), and only after that resolves (`ready`) does the
 * narrative call fire, with findings only — never raw transactions. Findings
 * rows themselves are domain output rendered directly, so like the insight
 * card's template tips they survive `flag_off`; opting out hides the whole
 * section (and skips the loader entirely). Zero findings short-circuits to a
 * domain no-issue line without spending any quota.
 */

type NarrativeState =
  | { kind: 'idle' }
  | { kind: 'hidden' }
  | { kind: 'ok'; narrative: string; cached: boolean }
  | { kind: 'error'; message: string }

export function MonthCloseSection({ ledgerId, ym }: { ledgerId: string; ym: YearMonth }) {
  const { user } = useAuth()
  const userId = user?.id
  const { version } = useRefresh()
  const [open, setOpen] = useState(false)

  const { data: settings } = useAsyncData(
    () => (userId ? getAiUserSettings(userId) : Promise.resolve(null)),
    [userId],
  )
  const enabled = settings?.inAppAiEnabled === true

  const now = currentYearMonth()
  const isPastMonth = ym.year < now.year || (ym.year === now.year && ym.month < now.month)
  const shouldLoad = enabled && isPastMonth && open

  const {
    data: review,
    loading: reviewLoading,
    error: reviewError,
  } = useAsyncData(
    () => (shouldLoad ? loadMonthCloseForNarrative(ledgerId, ym) : Promise.resolve(null)),
    [shouldLoad, ledgerId, ym.year, ym.month, version],
  )

  const findingsCount = review ? review.needsCheck.length + review.forReference.length : 0
  // Ready gate: the narrative effect keys on the resolved review, so it can
  // never fire while the loader is pending or failed (`review` still null).
  const reviewKey = review ? stableStringify(buildMonthCloseNarrativeInput(review)) : null
  const {
    data: narrative,
    loading: narrativeLoading,
    reload: regenerate,
  } = useAsyncData<NarrativeState>(async () => {
    if (!review || findingsCount === 0) return { kind: 'idle' }
    try {
      const input = buildMonthCloseNarrativeInput(review)
      const hash = await dataVersionHash(input)
      const res = await invokeAiFeature<MonthCloseNarrativeResult>({
        feature: 'month_close_narrative',
        ledgerId,
        input,
        dataVersionHash: hash,
      })
      if (res.result.groundedMonth !== review.month) {
        return { kind: 'error', message: '응답이 요청한 월과 일치하지 않습니다.' }
      }
      return { kind: 'ok', narrative: res.result.narrative, cached: res.cached === true }
    } catch (err) {
      if (isAiClientError(err) && err.code === 'flag_off') return { kind: 'hidden' }
      return {
        kind: 'error',
        message: isAiClientError(err) ? err.message : describeError(err).message,
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- reviewKey stands in for review
  }, [ledgerId, reviewKey])

  if (!enabled || !isPastMonth) return null

  const narrState: NarrativeState = narrative ?? { kind: 'idle' }
  const aiHidden = narrState.kind === 'hidden'

  return (
    <section className="rounded-[16px] border border-line bg-paper px-4 py-3.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between"
      >
        <span className="text-[13.5px] font-bold">월 마감 점검</span>
        <span aria-hidden className="text-[11.5px] text-ink3">
          {open ? '접기' : '펼치기'}
        </span>
      </button>

      {open && (
        <div className="mt-2">
          {reviewLoading && <p className="text-[12px] text-ink3">점검 데이터를 불러오는 중…</p>}
          {reviewError && <p className="text-[11.5px] text-danger">{reviewError.message}</p>}

          {review && (
            <>
              {findingsCount === 0 ? (
                <p className="text-[12.5px] leading-relaxed text-ink2">
                  특이사항이 없습니다. (카테고리 {review.noIssueSummary.categoriesChecked}개 · 거래{' '}
                  {review.noIssueSummary.transactionsChecked}건 점검)
                </p>
              ) : (
                <>
                  {!aiHidden &&
                    (narrativeLoading ? (
                      <p className="text-[12px] text-ink3">요약 생성 중…</p>
                    ) : narrState.kind === 'ok' ? (
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-[12.5px] leading-relaxed text-ink2">
                          {narrState.narrative}
                        </p>
                        <button
                          type="button"
                          onClick={regenerate}
                          className="shrink-0 text-[11.5px] font-semibold text-ink3"
                        >
                          다시 생성
                        </button>
                      </div>
                    ) : narrState.kind === 'error' ? (
                      <p className="mb-2 text-[11.5px] text-danger">{narrState.message}</p>
                    ) : null)}

                  <FindingGroup title="확인 필요" findings={review.needsCheck} />
                  <FindingGroup title="참고" findings={review.forReference} />
                  {review.truncated && (
                    <p className="mt-1.5 text-[11px] text-ink3">항목이 많아 일부만 표시했습니다.</p>
                  )}
                </>
              )}
            </>
          )}
        </div>
      )}
    </section>
  )
}

function FindingGroup({ title, findings }: { title: string; findings: MonthCloseFinding[] }) {
  if (findings.length === 0) return null
  return (
    <div className="mt-1.5">
      <div className="mb-1 text-[11px] font-semibold text-ink3">{title}</div>
      <ul className="flex flex-col gap-1">
        {findings.map((f) => (
          <li key={`${f.kind}:${f.label}`} className="tnum text-[12px] leading-relaxed text-ink2">
            {f.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
