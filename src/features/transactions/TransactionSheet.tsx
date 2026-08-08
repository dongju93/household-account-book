import { useEffect, useId, useRef, useState } from 'react'

import { useValidatedSubmit } from '../../app/useValidatedSubmit'
import {
  createTransaction,
  fetchNearDuplicateCandidates,
  updateTransaction,
} from '../../data/transactions'
import type { NlTxnDraftNormalized } from '../../domain/ai/nlTxnDraft'
import { FUND_TYPE_ITEMS } from '../../domain/fundType'
import type { FundType } from '../../domain/fundType'
import {
  type DuplicateCandidateTxn,
  findNearDuplicatesForDraft,
  normalizeMemo,
} from '../../domain/fuzzyDuplicates'
import type { Category, Transaction } from '../../domain/types'
import { validateTransactionInput } from '../../domain/validation'
import { won } from '../../lib/format'
import { formatDayHeader, todayISO } from '../../lib/month'
import {
  AmountInput,
  BottomSheet,
  Button,
  Chip,
  ErrorBanner,
  FieldError,
  Segmented,
  TextAction,
  TextInput,
  Toggle,
} from '../../ui'
import { NlDraftField } from './NlDraftField'
import { useMemoCategorySuggestions } from './useMemoCategorySuggestions'

/**
 * Create or edit a transaction. In create mode it offers 저장 후 계속 입력, which
 * keeps the date + 구분 and clears amount/memo (spec §5.1).
 */
export function TransactionSheet({
  open,
  onClose,
  ledgerId,
  transaction,
  categories,
  onSaved,
  onDelete,
}: {
  open: boolean
  onClose: () => void
  ledgerId: string
  transaction: Transaction | null // null = create
  categories: Category[] // active categories
  onSaved: () => void
  onDelete?: () => Promise<void> | void
}) {
  const editing = transaction !== null
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [type, setType] = useState<FundType>(transaction?.type ?? 'expense')
  const [categoryId, setCategoryId] = useState(transaction?.categoryId ?? '')
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : '')
  const [date, setDate] = useState(transaction?.txnDate ?? todayISO())
  const [memo, setMemo] = useState(transaction?.memo ?? '')
  const [keepOpen, setKeepOpen] = useState(false)
  // Remount key for the NL field: bumping it clears text/banner/warnings after 저장 후 계속.
  const [nlGeneration, setNlGeneration] = useState(0)
  // §5.14 pre-save guard. The warning carries the *form state it was raised for*
  // rather than a boolean, and that one key does double duty: the banner renders
  // only while the form still matches it, and a second 저장 press only proceeds
  // for that same key. Editing any field after the warning therefore both hides
  // the stale list and revokes the acknowledgement — "acknowledged a draft the
  // user has since changed" is not a representable state.
  const [duplicateWarning, setDuplicateWarning] = useState<{
    formKey: string
    txns: DuplicateCandidateTxn[]
  } | null>(null)
  const { errors, submitError, saving, run } = useValidatedSubmit()
  const amountErrorId = useId()
  const categoryErrorId = useId()
  const dateErrorId = useId()

  const { suggestions } = useMemoCategorySuggestions({
    ledgerId,
    memo,
    categories,
    enabled: open,
  })

  const typeCategories = categories.filter((c) => c.type === type)

  function changeType(next: FundType) {
    setType(next)
    setCategoryId('')
  }

  // Prefill only fields the draft resolved; null fields keep what the user typed.
  // A resolved type replaces the category selection wholesale so a chip from the
  // previous 구분 can never linger against the new one.
  function applyNlDraft(draft: NlTxnDraftNormalized) {
    if (draft.type) {
      setType(draft.type)
      setCategoryId(draft.categoryId ?? '')
    } else if (draft.categoryId) {
      setCategoryId(draft.categoryId)
    }
    if (draft.amount != null) setAmount(String(draft.amount))
    if (draft.date) setDate(draft.date)
    if (draft.memo != null) setMemo(draft.memo)
  }

  /**
   * Rows already on record that this draft would duplicate.
   *
   * Fails **open**: if the lookup errors (offline, RLS, timeout) the save
   * proceeds unwarned. A duplicate is a nuisance; a guard that blocks a
   * legitimate save because a read failed is a broken app.
   */
  async function findExistingNearDuplicates(value: {
    date: string
    amount: number
    categoryId: string
    type: FundType
    memo: string | null
  }): Promise<DuplicateCandidateTxn[]> {
    try {
      const existing = await fetchNearDuplicateCandidates(ledgerId, {
        txnDate: value.date,
        type: value.type,
        amount: value.amount,
        categoryId: value.categoryId,
      })
      return findNearDuplicatesForDraft(
        {
          txnDate: value.date,
          type: value.type,
          amount: value.amount,
          categoryId: value.categoryId,
          memo: value.memo,
        },
        existing,
        { excludeId: transaction?.id ?? null },
      )
    } catch {
      return []
    }
  }

  /**
   * Identity of the current form state for guard purposes. Built from the raw
   * fields rather than the validated draft so it can be recomputed on every
   * render without running validation. Two different raw states that validate to
   * the same transaction (e.g. "10000" vs " 10000") simply re-run the guard —
   * the conservative direction.
   */
  const formKey = [date, amount.trim(), categoryId, type, normalizeMemo(memo)].join('|')
  const showDuplicateWarning = duplicateWarning?.formKey === formKey

  // `handleSubmit` closes over the form state as of the press that started it,
  // and the inputs stay editable while the duplicate lookup is in flight — so
  // that closure alone cannot answer "is this still what the user is looking
  // at?" after an await. This ref mirrors the *committed* key so the post-await
  // check compares against what is actually on screen. Written in an effect
  // rather than during render on purpose: a render React discards (StrictMode,
  // an interrupted concurrent render) must not move the identity a write is
  // gated on to state the user never saw.
  const committedFormKeyRef = useRef(formKey)
  useEffect(() => {
    committedFormKeyRef.current = formKey
  }, [formKey])

  async function handleSubmit() {
    const category = categories.find((c) => c.id === categoryId) ?? null
    const ok = await run(
      () =>
        validateTransactionInput(
          { amount, date, categoryId: categoryId || null, type, memo },
          category,
        ),
      async (value) => {
        // Guard runs on the *validated* draft, so it queries the integer amount
        // that would actually be written — never the raw input string.
        const pressedFormKey = formKey
        if (!showDuplicateWarning) {
          const matches = await findExistingNearDuplicates(value)
          // The lookup is a network read the user can type straight through, and
          // its answer describes the draft *as pressed*. If the form has moved
          // on, neither outcome may be acted on: writing would persist values
          // the user has already replaced, and warning would pin a banner to a
          // draft that no longer exists. Drop the result — 저장 is enabled again
          // the moment `saving` clears, and that press re-guards the new values.
          if (committedFormKeyRef.current !== pressedFormKey) return
          if (matches.length > 0) {
            setDuplicateWarning({ formKey: pressedFormKey, txns: matches })
            return // warn and stop; a second 저장 press on the same form writes.
          }
        }
        setDuplicateWarning(null)

        const write = {
          categoryId: value.categoryId,
          type: value.type,
          txnDate: value.date,
          amount: value.amount,
          memo: value.memo,
        }
        if (editing) await updateTransaction(transaction.id, write)
        else await createTransaction(ledgerId, write)
        onSaved()
        if (editing || !keepOpen) {
          onClose()
        } else {
          setAmount('')
          setMemo('')
          setCategoryId('')
          setNlGeneration((g) => g + 1)
        }
      },
    )
    if (!ok) return
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? '거래 수정' : '거래 추가'}>
      <div className="flex flex-col gap-4">
        {/* §6.5: the natural-language field keeps its current position and its
            apply-only behaviour — it never writes. */}
        {!editing && open && (
          <NlDraftField
            key={nlGeneration}
            ledgerId={ledgerId}
            categories={categories}
            onDraft={applyNlDraft}
          />
        )}

        {editing && transaction.source === 'recurring' && (
          <p className="text-caption rounded-control bg-fill1 px-3 py-2 text-ink2">
            고정 항목에서 생성된 거래입니다. 이 달의 내역만 수정됩니다.
          </p>
        )}

        <Segmented label="자금 구분" items={FUND_TYPE_ITEMS} value={type} onChange={changeType} />

        {/* §6.5: the amount is the sheet's strongest visual element — hero type on
            a hero-radius surface, and the sheet's focus entry point in create mode.
            It carries no caption: a ₩ mark beside a 32px figure is not a field
            anyone needs told, and the caption only served to make the row look
            like every other field — the opposite of what §6.5 asks for. The
            accessible name is on the input itself, so nothing is lost for AT. */}
        <div className="flex flex-col gap-1.5">
          <AmountInput
            value={amount}
            onChange={setAmount}
            size="hero"
            autoFocus={!editing}
            aria-label="금액"
            aria-invalid={errors.amount ? true : undefined}
            aria-describedby={errors.amount ? amountErrorId : undefined}
          />
          {errors.amount && <FieldError id={amountErrorId}>{errors.amount}</FieldError>}
        </div>

        <div className="flex flex-col gap-1.5">
          <span className="text-caption font-semibold text-ink2">카테고리</span>
          {suggestions.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 rounded-control bg-fill1 px-2.5 py-1.5 text-caption">
              <span className="font-semibold text-ink2">추천:</span>
              {suggestions.map((s) => (
                <Chip
                  key={s.categoryId}
                  active={s.categoryId === categoryId}
                  density="compact"
                  onClick={() => {
                    // Deliberately bypasses changeType (which resets the category):
                    // a suggestion applies type + category as one unit, like applyNlDraft.
                    if (s.type !== type) {
                      setType(s.type)
                    }
                    setCategoryId(s.categoryId)
                  }}
                >
                  {s.categoryName}
                  {s.type !== type && (
                    <span className="ml-1 text-[10px] opacity-75">
                      (
                      {s.type === 'income'
                        ? '수입'
                        : s.type === 'expense'
                          ? '지출'
                          : s.type === 'saving'
                            ? '저축'
                            : '투자'}
                      )
                    </span>
                  )}
                </Chip>
              ))}
            </div>
          )}
          {typeCategories.length === 0 ? (
            <p className="text-caption text-ink2">
              이 구분의 활성 카테고리가 없습니다. 설정에서 추가하세요.
            </p>
          ) : (
            <div
              className="flex flex-wrap gap-x-1.5 gap-y-3"
              role="group"
              aria-label="카테고리"
              aria-invalid={errors.categoryId ? true : undefined}
              aria-describedby={errors.categoryId ? categoryErrorId : undefined}
            >
              {typeCategories.map((c) => (
                <Chip
                  key={c.id}
                  active={c.id === categoryId}
                  density="compact"
                  onClick={() => setCategoryId(c.id)}
                >
                  {c.name}
                </Chip>
              ))}
            </div>
          )}
          {errors.categoryId && <FieldError id={categoryErrorId}>{errors.categoryId}</FieldError>}
        </div>

        <div className="grid grid-cols-1 gap-2.5 min-[360px]:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-caption font-semibold text-ink2">날짜</span>
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-invalid={errors.date ? true : undefined}
              aria-describedby={errors.date ? dateErrorId : undefined}
              className="tnum min-w-0 max-w-full"
            />
          </label>
          <label className="flex min-w-0 flex-col gap-1.5">
            <span className="text-caption font-semibold text-ink2">메모</span>
            <TextInput
              value={memo}
              onChange={(e) => setMemo(e.target.value)}
              placeholder="메모"
              className="min-w-0 max-w-full"
            />
          </label>
        </div>
        {errors.date && <FieldError id={dateErrorId}>{errors.date}</FieldError>}

        {/* An off-by-default preference for repeat entry, demoted to a plain row.
            It was a tinted card carrying a bold title and a two-line explanation
            — the visual weight of a primary control for something most sessions
            never touch, and the third nested surface in a sheet that only needed
            one. The explanation moves into the label itself: "…만 남기고" says
            what is preserved in the space the title alone used to take. */}
        {!editing && (
          <label className="flex items-center justify-between gap-3">
            <span className="text-caption text-ink2">날짜·구분만 남기고 계속 입력</span>
            <Toggle on={keepOpen} onChange={setKeepOpen} label="저장 후 계속 입력" />
          </label>
        )}

        {/* §5.14: a warning, not a block. The rows are listed so the user can
            recognise their own entry rather than take the app's word for it, and
            the only actions offered are 저장 (proceed) and closing the sheet —
            nothing here deletes or edits the existing rows (§5.7). */}
        {showDuplicateWarning && (
          <div
            role="alert"
            className="flex flex-col gap-1.5 rounded-surface border border-status-warning/35 bg-status-warning/8 px-3 py-2.5"
          >
            <p className="text-caption font-semibold text-status-warning">
              비슷한 거래가 이미 {duplicateWarning.txns.length}건 있습니다. 중복 입력일 수 있습니다.
            </p>
            <ul className="text-caption flex flex-col gap-0.5 text-ink2">
              {duplicateWarning.txns.map((t) => (
                <li key={t.id} className="tnum">
                  {formatDayHeader(t.txnDate)} · {won(t.amount)}
                  {t.memo?.trim() ? ` · ${t.memo.trim()}` : ''}
                </li>
              ))}
            </ul>
            <p className="text-caption text-ink2">
              그래도 저장하려면 저장을 한 번 더 누르세요. 기존 거래는 그대로 유지됩니다.
            </p>
          </div>
        )}

        {submitError && <ErrorBanner message={submitError} />}

        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? '저장 중…' : showDuplicateWarning ? '그래도 저장' : '저장'}
        </Button>

        {/* §6.5: two-step inline delete, unchanged. Only the confirming step's
            destructive button carries the danger colour — the trigger stays a
            tertiary text action so it cannot be hit by reflex. */}
        {editing && onDelete && !confirmingDelete && (
          <TextAction
            onClick={() => setConfirmingDelete(true)}
            className="mx-0 self-center text-status-danger enabled:hover:text-status-danger"
          >
            삭제
          </TextAction>
        )}
        {editing && onDelete && confirmingDelete && (
          <div className="flex flex-col gap-2.5 rounded-surface border border-status-danger/35 bg-status-danger/8 p-3">
            <p className="text-body text-center font-semibold text-ink">이 거래를 삭제할까요?</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                취소
              </Button>
              <Button
                variant="danger"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await onDelete()
                  } finally {
                    setDeleting(false)
                  }
                }}
              >
                {deleting ? '삭제 중…' : '삭제'}
              </Button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
