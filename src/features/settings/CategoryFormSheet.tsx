import { useState } from 'react'

import { useValidatedSubmit } from '../../app/useValidatedSubmit'
import { createCategory, updateCategory } from '../../data/categories'
import type { FundType } from '../../domain/fundType'
import { FUND_TYPE_ITEMS, fundTypeLabel, hasBudget, hasGoal } from '../../domain/fundType'
import type { Category } from '../../domain/types'
import { validateCategoryInput } from '../../domain/validation'
import {
  AmountInput,
  BottomSheet,
  Button,
  ErrorBanner,
  Field,
  Glyph,
  Segmented,
  TextInput,
  Toggle,
} from '../../ui'
import {
  ALL_GLYPH_KEYS,
  GLYPH_LABELS,
  type GlyphKey,
  glyphForCategory,
} from '../../ui/glyphForCategory'

export function CategoryFormSheet({
  open,
  onClose,
  ledgerId,
  category,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  ledgerId: string
  category: Category | null // null = create
  onSaved: () => void
}) {
  const editing = category !== null
  const [type, setType] = useState<FundType>(category?.type ?? 'expense')
  const [name, setName] = useState(category?.name ?? '')
  const [icon, setIcon] = useState<GlyphKey>(
    category?.icon ?? glyphForCategory(category?.name ?? '', category?.type ?? 'expense'),
  )
  const [budget, setBudget] = useState(
    category?.budgetAmount != null ? String(category.budgetAmount) : '',
  )
  const [goal, setGoal] = useState(category?.goalAmount != null ? String(category.goalAmount) : '')
  const [showBudgetPace, setShowBudgetPace] = useState(category?.showBudgetPace ?? false)
  const { errors, submitError, saving, run } = useValidatedSubmit()

  async function handleSubmit() {
    await run(
      () =>
        validateCategoryInput({
          name,
          type,
          budgetAmount: hasBudget(type) ? budget : undefined,
          goalAmount: hasGoal(type) ? goal : undefined,
        }),
      async (value) => {
        const paceEnabled =
          hasBudget(value.type) &&
          value.budgetAmount != null &&
          value.budgetAmount > 0 &&
          showBudgetPace

        if (editing) {
          await updateCategory(category.id, {
            name: value.name,
            icon,
            budgetAmount: value.budgetAmount,
            goalAmount: value.goalAmount,
            showBudgetPace: paceEnabled,
          })
        } else {
          await createCategory(ledgerId, {
            name: value.name,
            type: value.type,
            icon,
            budgetAmount: value.budgetAmount,
            goalAmount: value.goalAmount,
            showBudgetPace: paceEnabled,
          })
        }
        onSaved()
      },
    )
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? '카테고리 수정' : '카테고리 추가'}>
      <div className="flex flex-col gap-3">
        <Field label="구분">
          {editing ? (
            <p className="rounded-[12px] border border-line bg-fill1 px-3 py-2.5 text-sm text-ink2">
              {fundTypeLabel(type)}
            </p>
          ) : (
            <Segmented
              items={FUND_TYPE_ITEMS}
              value={type}
              onChange={(next) => {
                setType(next)
                setBudget('')
                setGoal('')
                setShowBudgetPace(false)
              }}
            />
          )}
          {editing && <p className="mt-1 text-[11px] text-ink3">구분은 변경할 수 없습니다.</p>}
        </Field>

        <Field label="이름" error={errors.name}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 식비"
          />
        </Field>

        <Field label="아이콘">
          <div className="flex flex-wrap gap-2 rounded-[12px] border border-line bg-paper p-2">
            {ALL_GLYPH_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setIcon(key)}
                title={GLYPH_LABELS[key]}
                className={
                  'flex flex-col items-center gap-1 rounded-[10px] px-2.5 py-2 transition-colors ' +
                  (icon === key ? 'bg-ink text-white' : 'text-ink2 hover:bg-fill2')
                }
              >
                <Glyph name={key} size={18} />
                <span className="text-[9.5px] leading-none font-medium">{GLYPH_LABELS[key]}</span>
              </button>
            ))}
          </div>
        </Field>

        {hasBudget(type) && (
          <>
            <Field label="예산 (월)" error={errors.budgetAmount}>
              <AmountInput value={budget} onChange={setBudget} />
            </Field>
            <div className="flex items-center justify-between rounded-[12px] border border-line bg-paper px-3 py-2.5">
              <div>
                <div className="text-xs font-semibold text-ink2">예산 페이스 표시</div>
                <p className="mt-0.5 text-[11px] text-ink3">
                  달성 확인에 남은 일수·하루 허용액을 표시합니다.
                </p>
              </div>
              <Toggle
                on={showBudgetPace}
                onChange={setShowBudgetPace}
                disabled={budget.trim() === ''}
              />
            </div>
          </>
        )}
        {hasGoal(type) && (
          <Field label="목표 금액" error={errors.goalAmount}>
            <AmountInput value={goal} onChange={setGoal} />
          </Field>
        )}
        {!hasBudget(type) && !hasGoal(type) && (
          <p className="text-[12px] text-ink3">
            {fundTypeLabel(type)} 카테고리는 예산/목표가 없습니다.
          </p>
        )}

        {submitError && <ErrorBanner message={submitError} />}

        <Button onClick={handleSubmit} disabled={saving} className="mt-1">
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  )
}
