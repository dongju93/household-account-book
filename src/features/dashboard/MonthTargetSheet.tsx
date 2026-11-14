import { useId, useRef, useState } from 'react'

import { useUnsavedChanges } from '../../app/useUnsavedChanges'
import { useValidatedSubmit } from '../../app/useValidatedSubmit'
import { saveCategoryMonthTarget } from '../../data/categoryMonthTargets'
import {
  type CategoryMonthTarget,
  type MonthTargetChoice,
  parseMonthTargetChoice,
} from '../../domain/categoryMonthTargets'
import type { Category } from '../../domain/types'
import { won } from '../../lib/format'
import type { YearMonth } from '../../lib/month'
import { BottomSheet, Button, ErrorBanner, Field, inputClassName } from '../../ui'

/** Mounted per edit session; category and month are captured until dismissal. */
export function MonthTargetSheet({
  category,
  ym,
  target,
  onClose,
  onSaved,
}: {
  category: Category
  ym: YearMonth
  target?: CategoryMonthTarget
  onClose: () => void
  onSaved: () => void
}) {
  const groupName = useId()
  const amountRef = useRef<HTMLInputElement>(null)
  const label = category.type === 'expense' ? '예산' : '목표'
  const globalAmount = category.type === 'expense' ? category.budgetAmount : category.goalAmount
  const [source, setSource] = useState<MonthTargetChoice['source']>(target?.source ?? 'global')
  const [amount, setAmount] = useState(String(target?.customAmount ?? globalAmount ?? ''))
  const { errors, setErrors, submitError, saving, run } = useValidatedSubmit()
  const requestClose = useUnsavedChanges(JSON.stringify([source, amount]), true, saving, onClose)

  return (
    <BottomSheet
      open
      onClose={requestClose}
      title={`${ym.year}년 ${ym.month}월 · ${category.name} ${label}`}
    >
      <form
        aria-label={`${category.name} 월별 ${label} 편집`}
        className="flex flex-col gap-4"
        noValidate
        onSubmit={async (event) => {
          event.preventDefault()
          if (saving) return
          const result = parseMonthTargetChoice(source, amount)
          if (!result.ok) amountRef.current?.focus()
          await run(
            () => result,
            async (choice) => {
              await saveCategoryMonthTarget(category, ym, choice)
              onSaved()
            },
          )
        }}
      >
        <fieldset disabled={saving} className="flex flex-col gap-3">
          <legend className="text-caption mb-2 font-semibold text-ink2">적용 기준</legend>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-line px-3 py-2">
            <input
              type="radio"
              name={groupName}
              value="global"
              checked={source === 'global'}
              onChange={() => setSource('global')}
              className="accent-ink"
            />
            <span className="text-body flex-1 text-ink">글로벌 설정 사용</span>
            <span className="tnum text-caption text-ink2">
              {globalAmount == null ? `${label} 없음` : won(globalAmount)}
            </span>
          </label>
          <label className="flex min-h-12 cursor-pointer items-center gap-3 rounded-control border border-line px-3 py-2">
            <input
              type="radio"
              name={groupName}
              value="custom"
              checked={source === 'custom'}
              onChange={() => setSource('custom')}
              className="accent-ink"
            />
            <span className="text-body text-ink">이 달 금액 사용</span>
          </label>
          {source === 'custom' && (
            <Field label={`이 달 ${label} (원)`} error={errors.amount}>
              <input
                ref={amountRef}
                name="amount"
                type="text"
                inputMode="numeric"
                enterKeyHint="done"
                required
                value={amount}
                onChange={(event) => {
                  setAmount(event.target.value)
                  setErrors({})
                }}
                placeholder="0"
                className={`${inputClassName} tnum text-right`}
              />
            </Field>
          )}
        </fieldset>
        <div aria-live="polite">{submitError && <ErrorBanner message={submitError} />}</div>
        <div className="flex gap-2">
          <Button variant="ghost" onClick={requestClose} disabled={saving}>
            취소
          </Button>
          <Button type="submit" disabled={saving}>
            {saving ? '저장 중…' : '저장'}
          </Button>
        </div>
      </form>
    </BottomSheet>
  )
}
