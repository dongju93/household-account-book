import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { dataVersionHash, stableStringify } from '../../ai/hash'
import {
  PERIOD_EXPLAIN_PROMPT_REV,
  type PeriodExplainInput,
  type PeriodExplainResult,
} from '../../ai/types'
import { useAiSettings } from '../../ai/useAiSettings'
import { useAsyncData } from '../../app/useAsyncData'
import { describeError } from '../../data/errors'
import { polishInsightBullets } from '../../domain/ai/polishInsightText'
import { Skeleton, SkeletonScreen, TextAction } from '../../ui'

type ExplainState =
  | { kind: 'idle' }
  | { kind: 'hidden' }
  | { kind: 'ok'; bullets: string[]; cached: boolean }
  | { kind: 'error'; message: string }

export function AiPeriodExplainCard({
  ledgerId,
  input,
  ready,
}: {
  ledgerId: string
  input: PeriodExplainInput
  ready: boolean
}) {
  const { enabled } = useAiSettings()

  const inputKey = stableStringify(input)
  // Gates render can decide synchronously. They must stay out of the async
  // result: a resolved `hidden` is indistinguishable from "still fetching" once
  // `loading` flips true again, which hides the skeleton on the next real
  // request (first load, and after every period switch — the switch drops
  // `ready`, and that run would otherwise overwrite the previous outcome).
  const active = enabled && ready && Boolean(ledgerId) && input.months.length > 0

  const {
    data: explain,
    loading,
    reload,
    // The explicit return type breaks the inference cycle created by reading
    // `explain` back inside its own loader.
  } = useAsyncData<ExplainState>(async (): Promise<ExplainState> => {
    // Carry the last outcome forward rather than clobbering it, so a sticky
    // `flag_off` hide survives an inactive run instead of flashing a card.
    if (!active) return explain ?? { kind: 'idle' }
    try {
      const hash = await dataVersionHash({ promptRev: PERIOD_EXPLAIN_PROMPT_REV, input })
      const res = await invokeAiFeature<PeriodExplainResult>({
        feature: 'period_explain',
        ledgerId,
        input,
        dataVersionHash: hash,
      })
      if (res.result.periodKey !== input.periodKey) {
        return { kind: 'error', message: '응답이 요청한 기간과 일치하지 않습니다.' }
      }
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
  }, [ledgerId, enabled, ready, inputKey])

  if (!active) return null

  // `idle` now only means "not resolved yet", so it falls through to the
  // skeleton below; `hidden` is the gateway kill switch alone.
  const state: ExplainState = explain ?? { kind: 'idle' }
  if (state.kind === 'hidden') return null

  return (
    <section className="rounded-surface bg-fill1 px-4 py-3.5">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-2">
          <h2 className="text-section text-ink">AI 기간 해설</h2>
          <span className="text-caption text-ink2">AI가 작성한 조언</span>
        </div>
        <TextAction onClick={reload} disabled={loading}>
          다시 생성
        </TextAction>
      </div>

      {loading ? (
        <SkeletonScreen label="기간 해설 생성 중…" className="gap-2 py-0.5">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-[85%]" />
          <Skeleton className="h-3 w-[70%]" />
        </SkeletonScreen>
      ) : state.kind === 'ok' ? (
        <ul className="flex flex-col gap-1.5">
          {state.bullets.map((b) => (
            <li key={b} className="text-body flex gap-2 text-ink2 text-pretty">
              <span aria-hidden className="mt-2 h-1 w-1 flex-none rounded-full bg-ink3" />
              {b}
            </li>
          ))}
        </ul>
      ) : state.kind === 'error' ? (
        <p className="text-caption text-status-danger">{state.message}</p>
      ) : null}
    </section>
  )
}
