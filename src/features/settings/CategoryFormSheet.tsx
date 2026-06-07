import type { ReactNode } from 'react'
import { useState } from 'react'
import { createCategory, updateCategory } from '../../data/categories'
import { describeError } from '../../data/errors'
import type { FundType } from '../../domain/fundType'
import { FUND_TYPES, fundTypeLabel, hasBudget, hasGoal } from '../../domain/fundType'
import type { Category } from '../../domain/types'
import { validateCategoryInput } from '../../domain/validation'
import { BottomSheet, Button, ErrorBanner, Glyph } from '../../ui'
import {
  ALL_GLYPH_KEYS,
  GLYPH_LABELS,
  type GlyphKey,
  glyphForCategory,
} from '../../ui/glyphForCategory'

const TYPE_ITEMS = FUND_TYPES.map((t) => ({ value: t, label: fundTypeLabel(t) }))

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
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  async function handleSubmit() {
    const result = validateCategoryInput({
      name,
      type,
      budgetAmount: hasBudget(type) ? budget : undefined,
      goalAmount: hasGoal(type) ? goal : undefined,
    })
    if (!result.ok) {
      setErrors(result.errors)
      return
    }
    setErrors({})
    setSubmitError(null)
    setSaving(true)
    try {
      if (editing) {
        await updateCategory(category.id, {
          name: result.value.name,
          icon,
          budgetAmount: result.value.budgetAmount,
          goalAmount: result.value.goalAmount,
        })
      } else {
        await createCategory(ledgerId, {
          name: result.value.name,
          type: result.value.type,
          icon,
          budgetAmount: result.value.budgetAmount,
          goalAmount: result.value.goalAmount,
        })
      }
      onSaved()
    } catch (err) {
      setSubmitError(describeError(err).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title={editing ? '카테고리 수정' : '카테고리 추가'}>
      <div className="flex flex-col gap-3">
        <Field label="구분">
          <div className="flex flex-wrap gap-1.5">
            {TYPE_ITEMS.map((it) => (
              <button
                key={it.value}
                type="button"
                disabled={editing} // type change is blocked to protect existing transactions
                onClick={() => {
                  setType(it.value)
                  setBudget('')
                  setGoal('')
                }}
                className={
                  'rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors ' +
                  (type === it.value
                    ? 'border-ink bg-ink text-white'
                    : 'border-line bg-paper text-ink2') +
                  (editing ? ' opacity-60' : '')
                }
              >
                {it.label}
              </button>
            ))}
          </div>
          {editing && <p className="mt-1 text-[11px] text-ink3">구분은 변경할 수 없습니다.</p>}
        </Field>

        <Field label="이름" error={errors.name}>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="예: 식비"
            className="w-full rounded-[12px] border border-line bg-paper px-3 py-2.5 text-sm outline-none focus:border-ink"
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
          <Field label="예산 (월)" error={errors.budgetAmount}>
            <AmountInput value={budget} onChange={setBudget} />
          </Field>
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

function Field({ label, error, children }: { label: string; error?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-ink2">{label}</span>
      {children}
      {error && <span className="text-[11px] text-danger">{error}</span>}
    </label>
  )
}

function AmountInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center rounded-[12px] border border-line bg-paper px-3">
      <span className="text-sm text-ink3">₩</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        inputMode="numeric"
        placeholder="0"
        className="tnum w-full bg-transparent px-2 py-2.5 text-right text-sm outline-none"
      />
    </div>
  )
}
