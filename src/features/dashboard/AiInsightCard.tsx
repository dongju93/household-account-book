import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { dataVersionHash, stableStringify } from '../../ai/hash'
import {
  MONTH_INSIGHT_PROMPT_REV,
  type MonthInsightInput,
  type MonthInsightResult,
} from '../../ai/types'
import { useAsyncData } from '../../app/useAsyncData'
import { useAuth } from '../../auth/useAuth'
import { getAiUserSettings } from '../../data/aiSettings'
import { describeError } from '../../data/errors'
import { polishInsightBullets } from '../../domain/ai/polishInsightText'

/**
 * AI 월간 인사이트 카드 (S06 / PR-6, spec §5.3).
 *
 * Numbers on screen stay domain-bound (SummaryCards/AchievementList); this card
 * renders LLM coaching bullets only, from aggregates built by
 * `buildMonthInsightInput`. Hidden entirely when the user opted out (Edge
 * re-enforces server-side) and when `flag_off` (ops kill switch) is on.
 * 다시 생성 re-invokes AI (same aggregates + `MONTH_INSIGHT_PROMPT_REV` → cache
 * hit, no quota), so it acts as a retry after an error rather than a reroll.
 *
 * The §5.11 offline 절약 팁 pool used to render under the bullets; it was
 * dropped because it was built from the same three aggregates the LLM already
 * receives (summary/achievements/topExpenses) and only restated them in weaker
 * form — including "다음 달 한도를 재조정" advice the month_insight prompt now
 * explicitly forbids as arithmetically meaningless.
 */

type InsightState =
  | { kind: 'idle' }
  | { kind: 'hidden' }
  | { kind: 'ok'; bullets: string[]; cached: boolean }
  | { kind: 'error'; message: string }

export function AiInsightCard({ ledgerId, input }: { ledgerId: string; input: MonthInsightInput }) {
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
      // promptRev busts stale cache after system-prompt quality upgrades without
      // changing aggregates (and without sending rev into the LLM payload).
      const hash = await dataVersionHash({ promptRev: MONTH_INSIGHT_PROMPT_REV, input })
      const res = await invokeAiFeature<MonthInsightResult>({
        feature: 'month_insight',
        ledgerId,
        input,
        dataVersionHash: hash,
      })
      if (res.result.groundedMonth !== input.month) {
        return { kind: 'error', message: '응답이 요청한 월과 일치하지 않습니다.' }
      }
      // Belt-and-suspenders: Edge validates schema before cache, but a stale
      // client contract or bypass must not crash on state.bullets.map.
      const bullets = res.result.bullets
      if (
        !Array.isArray(bullets) ||
        bullets.length === 0 ||
        !bullets.every((b) => typeof b === 'string')
      ) {
        return { kind: 'error', message: '응답 형식이 올바르지 않습니다.' }
      }
      return {
        kind: 'ok',
        bullets: polishInsightBullets(bullets),
        cached: res.cached === true,
      }
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
  if (state.kind === 'hidden') return null

  return (
    <section className="rounded-[16px] border border-line bg-paper px-4 py-3.5">
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-[13.5px] font-bold">AI 인사이트</span>
        <button
          type="button"
          onClick={reload}
          disabled={loading}
          className="text-[11.5px] font-semibold text-ink3 disabled:opacity-50"
        >
          다시 생성
        </button>
      </div>

      {loading ? (
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
      ) : null}
    </section>
  )
}
