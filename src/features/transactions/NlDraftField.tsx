import { useState } from 'react'

import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { AI_LIMITS } from '../../ai/types'
import type { NlTxnParseInput, NlTxnParseResult } from '../../ai/types'
import { useAsyncData } from '../../app/useAsyncData'
import { useAuth } from '../../auth/useAuth'
import { useLedger } from '../../auth/useLedger'
import { getAiUserSettings } from '../../data/aiSettings'
import { describeError } from '../../data/errors'
import { normalizeNlTxnDraft } from '../../domain/ai/nlTxnDraft'
import type { NlTxnDraftNormalized } from '../../domain/ai/nlTxnDraft'
import type { Category } from '../../domain/types'
import { todayISO } from '../../lib/month'
import { TextInput } from '../../ui'

/**
 * Natural-language draft entry above the create-mode transaction form
 * (S05 / PR-5, spec §5.1). Hidden for viewers and when in-app AI is off —
 * the Edge gateway enforces both again server-side. 적용 never saves:
 * it prefills the form via `onDraft` and surfaces field warnings; the only
 * write path stays the existing 저장 → validate → createTransaction flow.
 */
export function NlDraftField({
  ledgerId,
  categories,
  onDraft,
}: {
  ledgerId: string
  categories: Category[]
  onDraft: (draft: NlTxnDraftNormalized) => void
}) {
  const { canEdit } = useLedger()
  const { user } = useAuth()
  const userId = user?.id
  const { data: settings } = useAsyncData(
    () => (userId ? getAiUserSettings(userId) : Promise.resolve(null)),
    [userId],
  )
  const [text, setText] = useState('')
  const [applying, setApplying] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  if (!canEdit || !settings?.inAppAiEnabled) return null

  async function handleApply() {
    const trimmed = text.trim()
    if (!trimmed || applying) return
    if (categories.length === 0) {
      setError('활성 카테고리가 없어 자연어 입력을 사용할 수 없습니다.')
      return
    }
    setApplying(true)
    setError(null)
    setApplied(false)
    setWarnings([])
    try {
      const input: NlTxnParseInput = {
        text: trimmed.slice(0, AI_LIMITS.nlTxnParse.textMax),
        today: todayISO(),
        categories: categories
          .slice(0, AI_LIMITS.nlTxnParse.categoriesMax)
          .map((c) => ({ id: c.id, name: c.name, type: c.type })),
      }
      const res = await invokeAiFeature<NlTxnParseResult>({
        feature: 'nl_txn_parse',
        ledgerId,
        input,
      })
      const draft = normalizeNlTxnDraft(res.result.draft, input.categories)
      setWarnings([...new Set([...draft.warnings, ...(res.result.warnings ?? [])])])
      setApplied(true)
      onDraft(draft)
    } catch (err) {
      setError(isAiClientError(err) ? err.message : describeError(err).message)
    } finally {
      setApplying(false)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex gap-2">
        <TextInput
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              void handleApply()
            }
          }}
          maxLength={AI_LIMITS.nlTxnParse.textMax}
          placeholder="예: 어제 점심 1만2천원 식비"
          aria-label="자연어로 입력"
          disabled={applying}
        />
        <button
          type="button"
          onClick={() => void handleApply()}
          disabled={applying || !text.trim()}
          className="flex-none rounded-[12px] bg-ink px-4 text-sm font-bold text-white disabled:opacity-50"
        >
          {applying ? '해석 중…' : '적용'}
        </button>
      </div>
      {applied && (
        <p className="rounded-[10px] bg-warn/15 px-3 py-2 text-[11.5px] font-semibold text-warn">
          AI가 제안한 초안입니다. 내용을 확인한 뒤 저장해 주세요.
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="text-[11px] text-warn">
          {w}
        </p>
      ))}
      {error && <p className="text-[11px] text-danger">{error}</p>}
    </div>
  )
}
