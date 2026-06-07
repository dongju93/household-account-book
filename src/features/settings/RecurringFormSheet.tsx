import type { ReactNode } from 'react'
import { useState } from 'react'

import { describeError } from '../../data/errors'
import { createRecurring, updateRecurring } from '../../data/recurring'
import type { FundType } from '../../domain/fundType'
import { FUND_TYPES, fundTypeLabel } from '../../domain/fundType'
import type { Category, RecurringItem } from '../../domain/types'
import { validateRecurringInput } from '../../domain/validation'
import { currentYearMonth, monthKey } from '../../lib/month'
import { BottomSheet, Button, ErrorBanner } from '../../ui'

export function RecurringFormSheet({
  open,
  onClose,
  ledgerId,
  item,
  categories,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  ledgerId: string
  item: RecurringItem | null
  categories: Category[] // active categories
  onSaved: () => void
}) {
  const editing = item !== null
  const nowYm = currentYearMonth()

  const [type, setType] = useState<FundType>(item?.type ?? 'expense')
  const [categoryId, setCategoryId] = useState<string>(item?.categoryId ?? '')
  const [name, setName] = useState(item?.name ?? '')
  const [amount, setAmount] = useState(item ? String(item.amount) : '')
  const [startMonth, setStartMonth] = useState(
    item ? item.startMonth.slice(0, 7) : monthKey(nowYm.year, nowYm.month),
  )
  const [endMonth, setEndMonth] = useState(item?.endMonth ? item.endMonth.slice(0, 7) : '')
  const [dayOfMonth, setDayOfMonth] = useState(item ? String(item.dayOfMonth) : '1')
  const [memo, setMemo] = useState(item?.memo ?? '')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const typeCategories = categories.filter((c) => c.type === type)

  async function handleSubmit() {
    const category = categories.find((c) => c.id === categoryId) ?? null
    const result = validateRecurringInput(
      {
        name,
        type,
        categoryId: categoryId || null,
        amount,
        startMonth,
        endMonth: endMonth || null,
        dayOfMonth,
        memo,
      },
      category,
    )
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setSubmitError(null)
    setSaving(true)
    const write = {
      name: result.value.name,
      type: result.value.type,
      categoryId: result.value.categoryId,
      amount: result.value.amount,
      startMonth: result.value.startMonth,
      endMonth: result.value.endMonth,
      dayOfMonth: result.value.dayOfMonth,
      memo: result.value.memo,
    }
    try {
      if (editing) await updateRecurring(item.id, ledgerId, write)
      else await createRecurring(ledgerId, write)
      onSaved()
    } catch (err) {
      setSubmitError(describeError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? '고정 항목 수정' : '고정 항목 추가'}
    >
      <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto">
        <Field label="구분">
          <div className="flex flex-wrap gap-1.5">
            {FUND_TYPES.map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  setType(t)
                  setCategoryId('')
                }}
                className={
                  'rounded-full border px-3 py-1.5 text-xs font-semibold ' +
                  (type === t ? 'border-ink bg-ink text-white' : 'border-line bg-paper text-ink2')
                }
              >
                {fundTypeLabel(t)}
              </button>
            ))}
          </div>
        </Field>

        <Field label="카테고리" error={errors.categoryId}>
          {typeCategories.length === 0 ? (
            <p className="text-[12px] text-ink3">
              이 구분의 활성 카테고리가 없습니다. 먼저 카테고리를 추가하세요.
            </p>
          ) : (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              className="w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
            >
              <option value="">선택하세요</option>
              {typeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>

        <Field label="항목명" error={errors.name}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 월급"
            className="w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
          />
        </Field>

        <Field label="금액" error={errors.amount}>
          <div className="flex items-center rounded-[12px] border border-line bg-paper px-3">
            <span className="text-sm text-ink3">₩</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="numeric"
              placeholder="0"
              className="tnum w-full bg-transparent px-2 py-2.5 text-right text-sm outline-none"
            />
          </div>
        </Field>

        <div className="flex gap-2">
          <Field label="시작월" error={errors.startMonth} className="flex-1">
            <input
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
            />
          </Field>
          <Field label="종료월 (선택)" error={errors.endMonth} className="flex-1">
            <input
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
            />
          </Field>
        </div>

        <Field label="매월 발생일" error={errors.dayOfMonth}>
          <input
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="tnum w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
          />
        </Field>

        <Field label="메모 (선택)">
          <input
            value={memo}
            onChange={(e) => setMemo(e.target.value)}
            placeholder="메모"
            className="w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
          />
        </Field>

        {submitError && <ErrorBanner message={submitError} />}

        <Button onClick={handleSubmit} disabled={saving} className="mt-1">
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  )
}

function Field({
  label,
  error,
  className,
  children,
}: {
  label: string
  error?: string
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`flex flex-col gap-1 ${className ?? ''}`}>
      <span className="text-xs font-semibold text-ink2">{label}</span>
      {children}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </label>
  )
}
