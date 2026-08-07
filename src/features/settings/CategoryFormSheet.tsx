import { useState } from 'react'

import { useValidatedSubmit } from '../../app/useValidatedSubmit'
import { createCategory, updateCategory } from '../../data/categories'
import type { CategoryBudgetSuggestion } from '../../domain/budgetSuggestions'
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
  Won,
} from '../../ui'
import {
  ALL_GLYPH_KEYS,
  GLYPH_LABELS,
  type GlyphKey,
  glyphForCategory,
} from '../../ui/glyphForCategory'

export type CategoryFormTarget = { kind: 'create' } | { kind: 'edit'; category: Category }

type CategoryFormMode =
  | { kind: 'create' }
  | {
      kind: 'edit'
      category: Category
      budgetSuggestion: CategoryBudgetSuggestion | null
    }

export function CategoryFormSheet({
  open,
  onClose,
  ledgerId,
  target,
  onSaved,
}: {
  open: boolean
  onClose: () => void
  ledgerId: string
  target: CategoryFormMode
  onSaved: () => void
}) {
  const editing = target.kind === 'edit'
  const category = editing ? target.category : null
  const budgetSuggestion = editing ? target.budgetSuggestion : null
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

        if (target.kind === 'edit') {
          await updateCategory(target.category.id, {
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
      <div className="flex flex-col gap-4">
        <Field label="구분" hint={editing ? '구분은 변경할 수 없습니다.' : undefined}>
          {editing ? (
            <p className="text-body min-h-11 rounded-control border border-line bg-fill1 px-3 py-2.5 text-ink2">
              {fundTypeLabel(type)}
            </p>
          ) : (
            <Segmented
              label="자금 구분"
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
        </Field>

        <Field label="이름" error={errors.name}>
          <TextInput
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 식비"
          />
        </Field>

        <Field label="아이콘">
          {/* Icon labels are the §4.2 icon-adjacent exception, but 9.5px was well
              past it — they now sit on the `micro` step (11px) with a 44px tall
              target, which also satisfies §8 for a grid this dense. */}
          <div
            role="group"
            aria-label="아이콘"
            className="flex flex-wrap gap-1 rounded-surface border border-line bg-paper p-2"
          >
            {ALL_GLYPH_KEYS.map((key) => (
              <button
                key={key}
                type="button"
                aria-pressed={icon === key}
                onClick={() => setIcon(key)}
                className={
                  'pressable flex min-h-11 w-14 flex-col items-center justify-center gap-1 rounded-control px-1 py-1.5 ' +
                  (icon === key ? 'bg-ink text-paper' : 'text-ink2 hover:bg-fill1 hover:text-ink')
                }
              >
                <Glyph name={key} size={18} />
                <span className="text-micro w-full truncate text-center leading-none">
                  {GLYPH_LABELS[key]}
                </span>
              </button>
            ))}
          </div>
        </Field>

        {hasBudget(type) && (
          <>
            <Field label="예산 (월)" error={errors.budgetAmount}>
              <AmountInput value={budget} onChange={setBudget} />
            </Field>
            {budgetSuggestion && (
              <section
                aria-label="예산 제안"
                className="rounded-surface border border-line bg-fill1 px-3 py-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-body font-semibold text-ink">예산 제안</p>
                    <p className="text-caption mt-0.5 text-ink2 text-pretty">
                      최근 월별 지출 중앙값에 10% 여유를 더해 1만원 단위로 올린 참고용 금액입니다.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setBudget(String(budgetSuggestion.suggestedAmount))}
                    className="pressable text-caption min-h-12 flex-none rounded-control border border-line bg-paper px-3 font-semibold text-ink enabled:hover:bg-fill2"
                  >
                    제안 금액 입력
                  </button>
                </div>
                <dl className="mt-3 grid grid-cols-3 gap-2 text-center">
                  <div>
                    <dt className="text-micro text-ink3">현재</dt>
                    <dd className="text-caption mt-0.5 text-ink2">
                      <Won value={budgetSuggestion.currentAmount} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-micro text-ink3">제안</dt>
                    <dd className="text-caption mt-0.5 font-semibold text-ink">
                      <Won value={budgetSuggestion.suggestedAmount} />
                    </dd>
                  </div>
                  <div>
                    <dt className="text-micro text-ink3">증감</dt>
                    <dd className="text-caption mt-0.5 text-ink2">
                      <Won value={budgetSuggestion.difference} withSign />
                    </dd>
                  </div>
                </dl>
                <p className="text-caption mt-2 text-ink2">
                  입력 후에도 아래 저장을 눌러야 실제 예산에 적용됩니다.
                </p>
              </section>
            )}
            <div className="flex items-start justify-between gap-3 rounded-surface border border-line bg-paper px-3 py-2.5">
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">예산 페이스 표시</p>
                <p className="text-caption mt-0.5 text-ink2 text-pretty">
                  달성 확인에 남은 일수·하루 허용액을 표시합니다.
                </p>
              </div>
              <Toggle
                on={showBudgetPace}
                onChange={setShowBudgetPace}
                disabled={budget.trim() === ''}
                label="예산 페이스 표시"
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
          <p className="text-caption text-ink2">
            {fundTypeLabel(type)} 카테고리는 예산/목표가 없습니다.
          </p>
        )}

        {submitError && <ErrorBanner message={submitError} />}

        <Button onClick={handleSubmit} disabled={saving}>
          {saving ? '저장 중…' : '저장'}
        </Button>
      </div>
    </BottomSheet>
  )
}
