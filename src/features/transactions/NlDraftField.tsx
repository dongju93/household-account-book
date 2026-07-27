import { useState } from 'react'

import { invokeAiFeature, isAiClientError } from '../../ai/client'
import { AI_LIMITS } from '../../ai/types'
import type { NlTxnParseInput, NlTxnParseResult } from '../../ai/types'
import { useAiSettings } from '../../ai/useAiSettings'
import { useLedger } from '../../auth/useLedger'
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
  // Session-resolved, so the block is present in the sheet's first painted frame
  // instead of arriving a round trip after the entrance and shoving the form
  // down. See AiSettingsProvider.
  const { enabled: aiEnabled } = useAiSettings()
  const [text, setText] = useState('')
  const [applying, setApplying] = useState(false)
  const [warnings, setWarnings] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [applied, setApplied] = useState(false)

  if (!canEdit || !aiEnabled) return null

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
    // §6.5: this block keeps its position above the form and its apply-only
    // behaviour. It sits on the `fill1` AI surface used everywhere else so the
    // trust boundary is visible before the draft lands in the fields.
    <div className="flex flex-col gap-2 rounded-surface bg-fill1 p-3">
      <span className="text-caption font-semibold text-ink2">자연어로 입력</span>
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
          // Outlined, not solid ink. Two filled ink buttons in one sheet — 적용
          // and 저장 — both claimed to be *the* action, and the one that actually
          // commits the transaction sat at the bottom while the AI helper shouted
          // from the top. Demoting this to a bordered control leaves exactly one
          // primary button in the sheet, which is what makes the hierarchy legible.
          className="pressable text-body min-h-11 flex-none rounded-control border border-line bg-paper px-4 font-semibold text-ink enabled:hover:border-ink3 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applying ? '해석 중…' : '적용'}
        </button>
      </div>
      {/* §6.5: same wording, moved from the warning colour to `Status info` —
          a successfully applied draft is information, not a caution. The real
          caution is the per-field `warnings` below, which keep the warning tone. */}
      {applied && (
        <p className="text-caption rounded-control bg-status-info/12 px-3 py-2 font-semibold text-status-info">
          AI가 제안한 초안입니다. 내용을 확인한 뒤 저장해 주세요.
        </p>
      )}
      {warnings.map((w) => (
        <p key={w} className="text-caption text-status-warning">
          {w}
        </p>
      ))}
      {error && <p className="text-caption text-status-danger">{error}</p>}
    </div>
  )
}
