import { useState } from 'react'

import { useValidatedSubmit } from '../../app/useValidatedSubmit'
import { createRecurring, updateRecurring } from '../../data/recurring'
import type { FundType } from '../../domain/fundType'
import { FUND_TYPE_ITEMS } from '../../domain/fundType'
import type { Category, RecurringItem } from '../../domain/types'
import { validateRecurringInput } from '../../domain/validation'
import { currentYearMonth, monthKey } from '../../lib/month'
import {
  AmountInput,
  BottomSheet,
  Button,
  ErrorBanner,
  Field,
  Segmented,
  Select,
  TextInput,
} from '../../ui'

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
  const { errors, submitError, saving, run } = useValidatedSubmit()

  const typeCategories = categories.filter((c) => c.type === type)

  async function handleSubmit() {
    const category = categories.find((c) => c.id === categoryId) ?? null
    await run(
      () =>
        validateRecurringInput(
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
        ),
      async (value) => {
        const write = {
          name: value.name,
          type: value.type,
          categoryId: value.categoryId,
          amount: value.amount,
          startMonth: value.startMonth,
          endMonth: value.endMonth,
          dayOfMonth: value.dayOfMonth,
          memo: value.memo,
        }
        if (editing) await updateRecurring(item.id, ledgerId, write)
        else await createRecurring(ledgerId, write)
        onSaved()
      },
    )
  }

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={editing ? '고정 항목 수정' : '고정 항목 추가'}
    >
      {/* BottomSheet now owns the max height and the scroll, so this no longer
          nests a second scroll container inside one that already scrolls. */}
      <div className="flex flex-col gap-4">
        <Field label="구분">
          <Segmented
            label="자금 구분"
            items={FUND_TYPE_ITEMS}
            value={type}
            onChange={(next) => {
              setType(next)
              setCategoryId('')
            }}
          />
        </Field>

        <Field label="카테고리" error={errors.categoryId}>
          {typeCategories.length === 0 ? (
            <p className="text-caption text-ink2">
              이 구분의 활성 카테고리가 없습니다. 먼저 카테고리를 추가하세요.
            </p>
          ) : (
            <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">선택하세요</option>
              {typeCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </Select>
          )}
        </Field>

        <Field label="항목명" error={errors.name}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 월급"
          />
        </Field>

        <Field label="금액" error={errors.amount}>
          <AmountInput value={amount} onChange={setAmount} />
        </Field>

        <div className="flex gap-3">
          <Field label="시작월" error={errors.startMonth} className="min-w-0 flex-1">
            <TextInput
              type="month"
              value={startMonth}
              onChange={(e) => setStartMonth(e.target.value)}
              className="tnum"
            />
          </Field>
          <Field label="종료월 (선택)" error={errors.endMonth} className="min-w-0 flex-1">
            <TextInput
              type="month"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
              className="tnum"
            />
          </Field>
        </div>

        <Field label="매월 발생일" error={errors.dayOfMonth}>
          <TextInput
            type="number"
            min={1}
            max={31}
            value={dayOfMonth}
            onChange={(e) => setDayOfMonth(e.target.value)}
            className="tnum"
          />
        </Field>

        <Field label="메모 (선택)">
          <TextInput value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="메모" />
        </Field>

        {submitError && <ErrorBanner message={submitError} />}

        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  )
}
