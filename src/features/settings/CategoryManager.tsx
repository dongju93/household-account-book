import { useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { listCategories, reorderCategories, setCategoryActive } from '../../data/categories'
import { fundTypeLabel } from '../../domain/fundType'
import type { Category } from '../../domain/types'
import { Glyph, IconButton, Pill, Toggle, Won } from '../../ui'
import { glyphForCategory } from '../../ui/glyphForCategory'
import { CategoryFormSheet } from './CategoryFormSheet'
import { SettingsSection } from './SettingsSection'
import { useManagedList } from './useManagedList'

/**
 * 카테고리 (docs/5. frontend-redesign-plan.md §6.7).
 *
 * Behaviour is untouched: the same up/down reorder, the same active toggle, the
 * same edit sheet. Two things change, both from §6.7:
 *
 * - The reorder carets and the active toggle now have real 44×44 touch targets
 *   and the shared focus ring, so a mis-tap on a dense list is far less likely.
 * - The row's edit target is bounded to the name block rather than stretching to
 *   the toggle, so "open the editor" and "deactivate" stop competing for the
 *   same pixels.
 */
export function CategoryManager({ ledgerId, canManage }: { ledgerId: string; canManage: boolean }) {
  const { refresh } = useRefresh()
  const { data, loading, error, reload } = useAsyncData(() => listCategories(ledgerId), [ledgerId])
  const [editing, setEditing] = useState<Category | null>(null)
  const { sheetOpen, setSheetOpen, actionError, openCreate, closeSheet, afterMutation, run } =
    useManagedList(refresh)

  const categories = data ?? []

  async function move(index: number, dir: -1 | 1) {
    const next = [...categories]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    await run(() => reorderCategories(next.map((c) => c.id)), reload)
  }

  return (
    <>
      <SettingsSection
        title="카테고리"
        description="거래를 분류하는 항목입니다. 순서는 입력 화면의 칩 순서와 같습니다."
        canAdd={canManage}
        onAdd={() => {
          setEditing(null)
          openCreate()
        }}
        actionError={actionError}
        loading={loading}
        error={error}
        empty={
          categories.length === 0
            ? { title: '카테고리가 없습니다', description: '카테고리를 추가해 거래를 분류하세요.' }
            : null
        }
      >
        {categories.map((c, i) => (
          <div
            key={c.id}
            className={
              'flex items-center gap-2 border-b border-line-soft px-2 py-2 last:border-b-0 ' +
              (c.isActive ? '' : 'opacity-60')
            }
          >
            {/*
              The two carets sit stacked, so they cannot each claim a 44×44
              centred hit area without overlapping — the lower one would capture
              taps meant for the upper. They get 44 wide × 28 tall each instead:
              well past WCAG 2.5.8's 24×24 minimum, and the largest target that
              still fits two controls in one list row. The `aria-label` names the
              category so a screen reader hears "식비 위로", not four bare "위로"s.
            */}
            {canManage && (
              <div className="flex flex-none flex-col">
                <IconButton
                  label={`${c.name} 위로`}
                  onClick={() => move(i, -1)}
                  disabled={i === 0}
                  expandHitArea={false}
                  className="h-7 w-11 rounded-control"
                >
                  <Caret dir="up" />
                </IconButton>
                <IconButton
                  label={`${c.name} 아래로`}
                  onClick={() => move(i, 1)}
                  disabled={i === categories.length - 1}
                  expandHitArea={false}
                  className="h-7 w-11 rounded-control"
                >
                  <Caret dir="down" />
                </IconButton>
              </div>
            )}

            <button
              type="button"
              onClick={() => {
                if (canManage) {
                  setEditing(c)
                  setSheetOpen(true)
                }
              }}
              disabled={!canManage}
              className="pressable flex min-h-12 min-w-0 flex-1 items-center gap-2.5 rounded-control px-1 text-left enabled:hover:bg-fill1"
            >
              <span className="flex h-9 w-9 flex-none items-center justify-center rounded-control border border-line bg-fill1 text-ink2">
                <Glyph name={c.icon ?? glyphForCategory(c.name, c.type)} size={18} />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-body truncate font-semibold text-ink">{c.name}</span>
                  <Pill tone="ink">{fundTypeLabel(c.type)}</Pill>
                </span>
                <TargetLabel category={c} />
              </span>
            </button>

            {canManage && (
              <Toggle
                on={c.isActive}
                onChange={(on) => run(() => setCategoryActive(c.id, on), reload)}
                label={`${c.name} 활성화`}
              />
            )}
          </div>
        ))}
      </SettingsSection>

      {sheetOpen && (
        <CategoryFormSheet
          open={sheetOpen}
          onClose={closeSheet}
          ledgerId={ledgerId}
          category={editing}
          onSaved={() => afterMutation(reload)}
        />
      )}
    </>
  )
}

/**
 * Null and 0 are the same state to every reader of this value: the achievement
 * layer collapses them (`budgetAmount ?? 0`), and a 0 target yields no
 * meaningful percentage or pace. Rendering null as "예산 없음" but 0 as "₩0" put
 * two labels on one state and left 여행/숙박 (₩0) and 약국/병원 (null) looking
 * unrelated while the dashboard treated them identically. Treat both as absent.
 */
function TargetLabel({ category }: { category: Category }) {
  if (category.type === 'expense') {
    return category.budgetAmount ? (
      <Won value={category.budgetAmount} className="text-caption text-ink2" />
    ) : (
      <span className="text-caption text-ink2">예산 없음</span>
    )
  }
  if (category.type === 'saving') {
    return category.goalAmount ? (
      <Won value={category.goalAmount} className="text-caption text-ink2" />
    ) : (
      <span className="text-caption text-ink2">목표 없음</span>
    )
  }
  return <span className="text-caption text-ink2">목표 없음</span>
}

function Caret({ dir }: { dir: 'up' | 'down' }) {
  return (
    <svg
      width="14"
      height="10"
      viewBox="0 0 14 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {dir === 'up' ? <path d="M3 7l4-4 4 4" /> : <path d="M3 3l4 4 4-4" />}
    </svg>
  )
}
