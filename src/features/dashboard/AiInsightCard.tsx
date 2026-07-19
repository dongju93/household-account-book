import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { dataVersionHash, stableStringify } from '../../ai/hash'
import type { MonthInsightInput, MonthInsightResult } from '../../ai/types'
import { useAsyncData } from '../../app/useAsyncData'
import { useAuth } from '../../auth/useAuth'
import { getAiUserSettings } from '../../data/aiSettings'
import { describeError } from '../../data/errors'

/**
 * AI 월간 인사이트 카드 (S06 / PR-6, spec §5.3 + §5.11).
 *
 * Numbers on screen stay domain-bound (SummaryCards/AchievementList); this card
 * renders LLM text only, from aggregates built by `buildMonthInsightInput`.
 * Hidden entirely when the user opted out (Edge re-enforces server-side).
 * `flag_off` (ops kill switch) hides the AI bullets quietly but keeps the
 * zero-cost template tips, which never duplicate `formatPaceHint` sentences.
 * 다시 생성 simply re-invokes: an unchanged `dataVersionHash` is a cache hit
 * (no quota claim); only changed data spends quota.
 */

type InsightState =
  | { kind: 'idle' }
  | { kind: 'hidden' }
  | { kind: 'ok'; bullets: string[]; cached: boolean }
  | { kind: 'error'; message: string }

export function AiInsightCard({
  ledgerId,
  input,
  tips,
}: {
  ledgerId: string
  input: MonthInsightInput
  tips: readonly string[]
}) {
  const { user } = useAuth()
  const userId = user?.id
  const { data: settings } = useAsyncData(
    () => (userId ? getAiUserSettings(userId) : Promise.resolve(null)),
    [userId],
  )
  const enabled = settings?.inAppAiEnabled === true

  // Aggregates change → key changes → re-fetch (cache hit unless data moved).
  const inputKey = stableStringify(input)
  const {
    data: insight,
    loading,
    reload,
  } = useAsyncData<InsightState>(async () => {
    if (!enabled) return { kind: 'idle' }
    try {
      const hash = await dataVersionHash(input)
      const res = await invokeAiFeature<MonthInsightResult>({
        feature: 'month_insight',
        ledgerId,
        input,
        dataVersionHash: hash,
      })
      if (res.result.groundedMonth !== input.month) {
        return { kind: 'error', message: '응답이 요청한 월과 일치하지 않습니다.' }
      }
      return { kind: 'ok', bullets: res.result.bullets, cached: res.cached === true }
    } catch (err) {
      if (isAiClientError(err) && err.code === 'flag_off') return { kind: 'hidden' }
      return {
        kind: 'error',
        message: isAiClientError(err) ? err.message : describeError(err).message,
      }
    }
    // oxlint-disable-next-line react-hooks/exhaustive-deps -- inputKey stands in for input
  }, [ledgerId, enabled, inputKey])

  if (!enabled) return null

  const state: InsightState = insight ?? { kind: 'idle' }
  const aiHidden = state.kind === 'hidden'
  if (aiHidden && tips.length === 0) return null

  return (
    <section className="rounded-[16px] border border-line bg-paper px-4 py-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13.5px] font-bold">AI 인사이트</span>
        {!aiHidden && (
          <button
            type="button"
            onClick={reload}
            disabled={loading}
            className="text-[11.5px] font-semibold text-ink3 disabled:opacity-50"
          >
            다시 생성
          </button>
        )}
      </div>

      {!aiHidden &&
        (loading ? (
          <p className="text-[12px] text-ink3">인사이트 생성 중…</p>
        ) : state.kind === 'ok' ? (
          <ul className="list-disc space-y-1 pl-4">
            {state.bullets.map((b) => (
              <li key={b} className="text-[12.5px] leading-relaxed text-ink2">
                {b}
              </li>
            ))}
          </ul>
        ) : state.kind === 'error' ? (
          <p className="text-[11.5px] text-danger">{state.message}</p>
        ) : null)}

      {tips.length > 0 && (
        <div className={aiHidden ? undefined : 'mt-2.5 border-t border-line-soft pt-2'}>
          <div className="mb-1 text-[11px] font-semibold text-ink3">절약 팁</div>
          <ul className="flex flex-col gap-1">
            {tips.map((t) => (
              <li key={t} className="tnum text-[12px] leading-relaxed text-ink2">
                {t}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}
