import { useState } from 'react'

import { useValidatedSubmit } from '../../app/useValidatedSubmit'
import { createTransaction, updateTransaction } from '../../data/transactions'
import { FUND_TYPE_ITEMS } from '../../domain/fundType'
import type { FundType } from '../../domain/fundType'
import type { Category, Transaction } from '../../domain/types'
import { validateTransactionInput } from '../../domain/validation'
import { todayISO } from '../../lib/month'
import { BottomSheet, Button, Chip, ErrorBanner, Segmented, TextInput, Toggle } from '../../ui'

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
  const { errors, submitError, saving, run } = useValidatedSubmit()

  const typeCategories = categories.filter((c) => c.type === type)

  function changeType(next: FundType) {
    setType(next)
    setCategoryId('')
  }

  async function handleSubmit() {
    const category = categories.find((c) => c.id === categoryId) ?? null
    const ok = await run(
      () =>
        validateTransactionInput(
          { amount, date, categoryId: categoryId || null, type, memo },
          category,
        ),
      async (value) => {
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
        }
      },
    )
    if (!ok) return
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? '거래 수정' : '거래 추가'}>
      <div className="flex flex-col gap-3">
        {editing && transaction.source === 'recurring' && (
          <p className="rounded-[10px] bg-fill1 px-3 py-2 text-[11px] text-ink2">
            고정 항목에서 생성된 거래입니다. 이 달의 내역만 수정됩니다.
          </p>
        )}

        <Segmented items={FUND_TYPE_ITEMS} value={type} onChange={changeType} />

        <div className="rounded-[13px] border border-line px-3.5 py-3 text-right">
          <span className="float-left mt-2 text-xs text-ink3">금액</span>
          <input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="numeric"
            placeholder="0"
            autoFocus={!editing}
            className="tnum w-full bg-transparent text-right text-2xl font-extrabold text-ink outline-none placeholder:text-ink3"
          />
        </div>
        {errors.amount && <span className="-mt-1 text-[11px] text-danger">{errors.amount}</span>}

        {typeCategories.length === 0 ? (
          <p className="text-[12px] text-ink3">
            이 구분의 활성 카테고리가 없습니다. 설정에서 추가하세요.
          </p>
        ) : (
          <div className="flex flex-wrap gap-1.5">
            {typeCategories.map((c) => (
              <Chip key={c.id} active={c.id === categoryId} onClick={() => setCategoryId(c.id)}>
                {c.name}
              </Chip>
            ))}
          </div>
        )}
        {errors.categoryId && (
          <span className="-mt-1 text-[11px] text-danger">{errors.categoryId}</span>
        )}

        <div className="flex gap-2">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-semibold text-ink2">날짜</span>
            <TextInput
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="tnum"
            />
          </label>
          <label className="flex flex-[1.2] flex-col gap-1">
            <span className="text-xs font-semibold text-ink2">메모</span>
            <TextInput value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" />
          </label>
        </div>
        {errors.date && <span className="-mt-1 text-[11px] text-danger">{errors.date}</span>}

        {!editing && (
          <div className="flex items-center justify-between">
            <span className="text-[12.5px] font-semibold text-ink2">저장 후 계속 입력</span>
            <Toggle on={keepOpen} onChange={setKeepOpen} />
          </div>
        )}

        {submitError && <ErrorBanner message={submitError} />}

        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </Button>

        {editing && onDelete && !confirmingDelete && (
          <button
            type="button"
            onClick={() => setConfirmingDelete(true)}
            className="py-1 text-center text-[13px] font-semibold text-danger"
          >
            삭제
          </button>
        )}
        {editing && onDelete && confirmingDelete && (
          <div className="flex flex-col gap-2 rounded-[12px] border border-danger/40 bg-danger/5 p-3">
            <span className="text-center text-[13px] font-semibold text-ink">
              이 거래를 삭제할까요?
            </span>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmingDelete(false)}>
                취소
              </Button>
              <button
                type="button"
                disabled={deleting}
                onClick={async () => {
                  setDeleting(true)
                  try {
                    await onDelete()
                  } finally {
                    setDeleting(false)
                  }
                }}
                className="w-full rounded-[13px] bg-danger py-3 text-[15px] font-bold text-white disabled:opacity-50"
              >
                {deleting ? '삭제 중…' : '삭제'}
              </button>
            </div>
          </div>
        )}
      </div>
    </BottomSheet>
  )
}
