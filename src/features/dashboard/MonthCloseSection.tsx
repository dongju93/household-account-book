import { useState } from 'react'

import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { dataVersionHash, stableStringify } from '../../ai/hash'
import {
  buildMonthCloseNarrativeInput,
  loadMonthCloseForNarrative,
} from '../../ai/loadMonthCloseForNarrative'
import { MONTH_CLOSE_NARRATIVE_PROMPT_REV, type MonthCloseNarrativeResult } from '../../ai/types'
import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { useAuth } from '../../auth/useAuth'
import { useLedger } from '../../auth/useLedger'
import { getAiUserSettings } from '../../data/aiSettings'
import { describeError } from '../../data/errors'
import type { MonthCloseFinding } from '../../domain/monthClose'
import { currentYearMonth, type YearMonth } from '../../lib/month'
import { ErrorBanner, Skeleton, SkeletonScreen, TextAction } from '../../ui'

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
 *
 * Viewers may open the section, but if the month was never materialized by an
 * editor the loader fails closed (see `MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON`)
 * instead of reporting an incomplete clean review.
 */

type NarrativeState =
  | { kind: 'idle' }
  | { kind: 'hidden' }
  | { kind: 'ok'; summary: string; actions: string[]; cached: boolean }
  | { kind: 'error'; message: string }

export function MonthCloseSection({ ledgerId, ym }: { ledgerId: string; ym: YearMonth }) {
  const { user } = useAuth()
  const userId = user?.id
  const { canEdit } = useLedger()
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
    () =>
      shouldLoad ? loadMonthCloseForNarrative(ledgerId, ym, { canEdit }) : Promise.resolve(null),
    [shouldLoad, ledgerId, ym.year, ym.month, version, canEdit],
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
      const hash = await dataVersionHash({
        promptRev: MONTH_CLOSE_NARRATIVE_PROMPT_REV,
        input,
      })
      const res = await invokeAiFeature<MonthCloseNarrativeResult>({
        feature: 'month_close_narrative',
        ledgerId,
        input,
        dataVersionHash: hash,
      })
      if (res.result.groundedMonth !== review.month) {
        return { kind: 'error', message: '응답이 요청한 월과 일치하지 않습니다.' }
      }
      return {
        kind: 'ok',
        summary: res.result.summary,
        actions: res.result.actions,
        cached: res.cached === true,
      }
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
    <section className="rounded-surface border border-line bg-paper">
      {/* §6.3: the expand/collapse behaviour and contents are unchanged; only the
          trigger's visual state is made explicit — a full-width 44px row with the
          shared hover/press/focus states and a chevron that follows aria-expanded. */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="pressable flex min-h-12 w-full items-center justify-between gap-3 rounded-surface px-4 py-3 text-left hover:bg-fill1"
      >
        <span className="text-section text-ink">월 마감 점검</span>
        <span className="text-caption flex items-center gap-1.5 text-ink2">
          {open ? '접기' : '펼치기'}
          <svg
            width="12"
            height="8"
            viewBox="0 0 12 8"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.7"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
            className={
              'transition-transform duration-(--dur-state) ease-(--ease-emphasized) ' +
              (open ? 'rotate-180' : '')
            }
          >
            <path d="M1 2l5 4 5-4" />
          </svg>
        </span>
      </button>

      {open && (
        <div className="flex flex-col gap-3 border-t border-line-soft px-4 py-3">
          {reviewLoading && (
            <SkeletonScreen label="점검 데이터를 불러오는 중…" className="gap-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-[75%]" />
            </SkeletonScreen>
          )}
          {reviewError && <ErrorBanner message={reviewError.message} />}

          {review && (
            <>
              {findingsCount === 0 ? (
                <p className="text-body text-ink2 text-pretty">
                  특이사항이 없습니다. (카테고리 {review.noIssueSummary.categoriesChecked}개 · 거래{' '}
                  {review.noIssueSummary.transactionsChecked}건 점검)
                </p>
              ) : (
                <>
                  {/* §3.1: the LLM summary keeps its own `fill1` surface, the same
                      one AiInsightCard uses, so it never reads as a domain finding. */}
                  {!aiHidden &&
                    (narrativeLoading ? (
                      <SkeletonScreen
                        label="요약 생성 중…"
                        className="gap-2 rounded-surface bg-fill1 p-3"
                      >
                        <Skeleton className="h-3 w-full" />
                        <Skeleton className="h-3 w-[70%]" />
                      </SkeletonScreen>
                    ) : narrState.kind === 'ok' ? (
                      <div className="flex flex-col gap-2 rounded-surface bg-fill1 p-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="text-caption text-ink2">AI가 제안한 마감 순서</span>
                          <TextAction onClick={regenerate}>다시 생성</TextAction>
                        </div>
                        <p className="text-body font-medium text-ink text-pretty">
                          {narrState.summary}
                        </p>
                        <ul className="flex list-decimal flex-col gap-1 pl-4">
                          {narrState.actions.map((action) => (
                            <li key={action} className="text-body text-ink2 text-pretty">
                              {action}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : narrState.kind === 'error' ? (
                      <p className="text-caption text-status-danger">{narrState.message}</p>
                    ) : null)}

                  <FindingGroup title="확인 필요" findings={review.needsCheck} tone="danger" />
                  <FindingGroup title="참고" findings={review.forReference} tone="info" />
                  {review.truncated && (
                    <p className="text-caption text-ink2">항목이 많아 일부만 표시했습니다.</p>
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

/**
 * Findings are domain output, so they stay on the plain surface. The group title
 * carries a status tint plus its own words — §4.1 forbids colour-only meaning,
 * so "확인 필요" and "참고" remain distinguishable in greyscale.
 */
function FindingGroup({
  title,
  findings,
  tone,
}: {
  title: string
  findings: MonthCloseFinding[]
  tone: 'danger' | 'info'
}) {
  if (findings.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5">
        <span
          aria-hidden
          className={
            'h-1.5 w-1.5 rounded-full ' +
            (tone === 'danger' ? 'bg-status-danger' : 'bg-status-info')
          }
        />
        <h3 className="text-caption font-semibold text-ink2">{title}</h3>
      </div>
      <ul className="flex flex-col gap-1">
        {findings.map((f) => (
          <li key={`${f.kind}:${f.label}`} className="tnum text-body text-ink2 text-pretty">
            {f.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
