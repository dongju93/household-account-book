import { useState } from 'react'

import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { loadChatSnapshot } from '../../ai/loadChatSnapshot'
import {
  AI_LIMITS,
  type ChatSnapshot,
  type ChatTurnInput,
  type ChatTurnResult,
} from '../../ai/types'
import { useAiSettings } from '../../ai/useAiSettings'
import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { describeError } from '../../data/errors'
import { appendUserTurn, type ChatMessage } from '../../domain/ai/chatTurn'
import { cn } from '../../lib/cn'
import { won } from '../../lib/format'
import {
  BottomSheet,
  Button,
  ErrorBanner,
  Skeleton,
  SkeletonScreen,
  TextAction,
  inputClassName,
} from '../../ui'

/**
 * Shown in the sheet header so the surface can never be mistaken for the
 * browser agent (WebMCP) — spec §5.4 / §9 "라벨: 앱 AI vs 브라우저 에이전트".
 */
export const CHAT_SURFACE_LABEL = '앱 AI'
export const CHAT_SURFACE_NOTE =
  '브라우저 에이전트가 아닌 앱 내장 AI입니다. 최근 3개월 집계만 읽으며 장부를 수정하지 않습니다.'
export const CHAT_UNAVAILABLE_MESSAGE = '앱 AI 채팅은 아직 열리지 않았습니다.'

/**
 * Capped in-app ledger Q&A (docs/4 §5.4, PR-13 / tracker S12).
 *
 * Read-only by construction: the only network call this component makes is
 * `invokeAiFeature('chat_turn')`, and the result is a string rendered as
 * prose. No data-layer write module is imported here, so a reply can never
 * become a ledger mutation — the model has no tools, and neither does the UI.
 *
 * Gates, in order: opted-out users see nothing (the Edge re-enforces with
 * `forbidden`); a `flag_off` reply — the chat-specific `AI_CHAT_ENABLED` or the
 * global kill switch — locks the sheet and tells the layout to drop the
 * launcher for the rest of the session. Every turn re-sends the snapshot and
 * the trimmed history (`appendUserTurn`), so the Edge caps are met before the
 * round trip rather than discovered as `validation` after it.
 */
export function ChatSheet({
  open,
  onClose,
  onUnavailable,
}: {
  open: boolean
  onClose: () => void
  /** Fired once when the gateway answers `flag_off`; the layout hides the entry. */
  onUnavailable: () => void
}) {
  const { ledgerId, canEdit } = useLedger()
  const { enabled } = useAiSettings()
  const { version } = useRefresh()
  const [history, setHistory] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [turnError, setTurnError] = useState<string | null>(null)
  const [unavailable, setUnavailable] = useState(false)

  // The snapshot is fetched per open (and after any mutation via `version`),
  // never per turn: a turn is one gateway call, and the numbers it is grounded
  // on should not drift mid-conversation.
  const active = open && enabled && Boolean(ledgerId)
  const {
    data: snapshot,
    loading: snapshotLoading,
    error: snapshotError,
    reload: reloadSnapshot,
  } = useAsyncData(
    () => (active && ledgerId ? loadChatSnapshot(ledgerId, { canEdit }) : Promise.resolve(null)),
    [active, ledgerId, version, canEdit],
  )

  if (!enabled || !ledgerId) return null

  const limits = AI_LIMITS.chatTurn
  const canSend = Boolean(snapshot) && !sending && !unavailable && draft.trim().length > 0

  async function handleSend() {
    if (!snapshot || !ledgerId || sending || unavailable) return
    const turn = appendUserTurn(history, draft, limits)
    if (!turn.ok) {
      setTurnError(
        turn.reason === 'too_long' ? `메시지는 ${limits.contentMax}자 이내로 입력해 주세요.` : null,
      )
      return
    }

    setSending(true)
    setTurnError(null)
    // Show the question immediately; on failure it is rolled back and the text
    // returned to the box so a retry is one tap, not a retype.
    setHistory(turn.messages)
    setDraft('')
    try {
      const input: ChatTurnInput = { messages: turn.messages, context: snapshot }
      const res = await invokeAiFeature<ChatTurnResult>({ feature: 'chat_turn', ledgerId, input })
      const reply = typeof res.result?.reply === 'string' ? res.result.reply.trim() : ''
      if (!reply) {
        throw new Error('응답 형식이 올바르지 않습니다.')
      }
      setHistory([...turn.messages, { role: 'assistant', content: reply }])
    } catch (err) {
      setHistory(history)
      setDraft(turn.messages.at(-1)?.content ?? '')
      if (isAiClientError(err) && err.code === 'flag_off') {
        setUnavailable(true)
        onUnavailable()
        return
      }
      setTurnError(isAiClientError(err) ? err.message : describeError(err).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={`${CHAT_SURFACE_LABEL}에게 묻기`}>
      <div className="flex flex-col gap-3">
        <p className="text-caption text-ink2 text-pretty">{CHAT_SURFACE_NOTE}</p>

        {snapshotLoading ? (
          <SkeletonScreen label="집계 준비 중…" className="gap-2 py-0.5">
            <Skeleton className="h-3 w-[60%]" />
            <Skeleton className="h-3 w-[40%]" />
          </SkeletonScreen>
        ) : snapshotError ? (
          <div className="flex flex-col items-start gap-2">
            <ErrorBanner
              message={snapshotError.message}
              variant={snapshotError.permission ? 'permission' : 'error'}
            />
            <TextAction onClick={reloadSnapshot}>다시 시도</TextAction>
          </div>
        ) : snapshot ? (
          <SnapshotBasis snapshot={snapshot} />
        ) : null}

        {history.length > 0 && (
          <ol aria-label="대화" className="flex flex-col gap-2">
            {history.map((m, i) => (
              <li
                key={`${i}-${m.role}`}
                className={cn(
                  'text-body max-w-[88%] rounded-surface px-3 py-2 whitespace-pre-wrap text-pretty',
                  m.role === 'user' ? 'self-end bg-ink text-paper' : 'self-start bg-fill1 text-ink',
                )}
              >
                <span className="sr-only">
                  {m.role === 'user' ? '나: ' : `${CHAT_SURFACE_LABEL}: `}
                </span>
                {m.content}
              </li>
            ))}
            {sending && (
              <li className="text-caption self-start px-1 text-ink2" aria-live="polite">
                답변 생성 중…
              </li>
            )}
          </ol>
        )}

        {unavailable ? (
          <p role="status" className="text-caption text-ink2">
            {CHAT_UNAVAILABLE_MESSAGE}
          </p>
        ) : (
          <form
            className="flex flex-col gap-2"
            onSubmit={(e) => {
              e.preventDefault()
              void handleSend()
            }}
          >
            <label className="sr-only" htmlFor="chat-draft">
              질문
            </label>
            <textarea
              id="chat-draft"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={limits.contentMax}
              rows={2}
              disabled={sending || !snapshot}
              placeholder="예: 식비를 가장 많이 쓴 달은?"
              className={cn(inputClassName, 'min-h-12 resize-none py-2')}
            />
            {turnError && <p className="text-caption text-status-danger">{turnError}</p>}
            <div className="flex items-center justify-between gap-3">
              <span className="text-micro tnum text-ink2">
                {draft.length}/{limits.contentMax}
              </span>
              <Button type="submit" disabled={!canSend} className="w-auto min-w-24">
                보내기
              </Button>
            </div>
          </form>
        )}
      </div>
    </BottomSheet>
  )
}

/**
 * 근거 집계 (§5.4 "답변 하단에 근거 집계 접기"): the exact numbers the model
 * was given, from the domain layer — so a figure in a reply can be checked
 * against its source without leaving the sheet.
 */
function SnapshotBasis({ snapshot }: { snapshot: ChatSnapshot }) {
  return (
    <details className="rounded-surface bg-fill1 px-3 py-2">
      <summary className="text-caption cursor-pointer font-semibold text-ink2">
        근거 집계 · {snapshot.months.length}개월{snapshot.truncated ? ' (일부 생략)' : ''}
      </summary>
      <ul className="mt-2 flex flex-col gap-1">
        {snapshot.months.map((m) => (
          <li key={m.month} className="text-caption tnum flex justify-between gap-3 text-ink2">
            <span>{m.month}</span>
            <span>
              지출 {won(m.expense)} · 수지 {won(m.balance, true)}
            </span>
          </li>
        ))}
      </ul>
    </details>
  )
}
