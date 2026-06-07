import { useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { listCategories, reorderCategories, setCategoryActive } from '../../data/categories'
import { describeError } from '../../data/errors'
import { fundTypeLabel } from '../../domain/fundType'
import type { Category } from '../../domain/types'
import { Card, EmptyState, ErrorBanner, Glyph, LoadingState, Pill, Toggle, Won } from '../../ui'
import { glyphForCategory } from '../../ui/glyphForCategory'
import { CategoryFormSheet } from './CategoryFormSheet'

export function CategoryManager({ ledgerId, canManage }: { ledgerId: string; canManage: boolean }) {
  const { refresh } = useRefresh()
  const { data, loading, error, reload } = useAsyncData(() => listCategories(ledgerId), [ledgerId])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<Category | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function afterMutation() {
    setSheetOpen(false)
    setActionError(null)
    reload()
    refresh() // let dashboard/transactions reflect category changes
  }

  async function run(action: () => Promise<void>) {
    try {
      setActionError(null)
      await action()
      reload()
      refresh()
    } catch (err) {
      setActionError(describeError(err).message)
    }
  }

  const categories = data ?? []

  async function move(index: number, dir: -1 | 1) {
    const next = [...categories]
    const target = index + dir
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    await run(() => reorderCategories(next.map((c) => c.id)))
  }

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[12.5px] font-bold text-ink2">카테고리</span>
        {canManage && (
          <button
            type="button"
            onClick={() => {
              setEditing(null)
              setSheetOpen(true)
            }}
            className="text-xs font-bold text-ink"
          >
            ＋ 추가
          </button>
        )}
      </div>

      {actionError && <ErrorBanner message={actionError} />}

      <Card pad="p-0">
        {loading && <LoadingState />}
        {error && (
          <div className="p-3">
            <ErrorBanner
              message={error.message}
              variant={error.permission ? 'permission' : 'error'}
            />
          </div>
        )}
        {!loading && !error && categories.length === 0 && (
          <EmptyState
            title="카테고리가 없습니다"
            description="카테고리를 추가해 거래를 분류하세요."
          />
        )}
        {!loading &&
          !error &&
          categories.map((c, i) => (
            <div
              key={c.id}
              className={
                'flex items-center gap-2.5 border-b border-line-soft px-3 py-2.5 last:border-b-0 ' +
                (c.isActive ? '' : 'opacity-55')
              }
            >
              {canManage && (
                <div className="flex flex-col">
                  <button
                    type="button"
                    aria-label="위로"
                    onClick={() => move(i, -1)}
                    disabled={i === 0}
                    className="text-ink3 disabled:opacity-30"
                  >
                    <Caret dir="up" />
                  </button>
                  <button
                    type="button"
                    aria-label="아래로"
                    onClick={() => move(i, 1)}
                    disabled={i === categories.length - 1}
                    className="text-ink3 disabled:opacity-30"
                  >
                    <Caret dir="down" />
                  </button>
                </div>
              )}

              <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[9px] border border-line bg-fill1 text-ink2">
                <Glyph name={c.icon ?? glyphForCategory(c.name, c.type)} size={17} />
              </span>

              <button
                type="button"
                onClick={() => {
                  if (canManage) {
                    setEditing(c)
                    setSheetOpen(true)
                  }
                }}
                className="flex flex-1 items-center gap-2 text-left"
              >
                <span className="text-sm font-semibold">{c.name}</span>
                <Pill tone="ink">{fundTypeLabel(c.type)}</Pill>
              </button>

              <TargetLabel category={c} />

              {canManage && (
                <Toggle on={c.isActive} onChange={(on) => run(() => setCategoryActive(c.id, on))} />
              )}
            </div>
          ))}
      </Card>

      {sheetOpen && (
        <CategoryFormSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          ledgerId={ledgerId}
          category={editing}
          onSaved={afterMutation}
        />
      )}
    </section>
  )
}

function TargetLabel({ category }: { category: Category }) {
  if (category.type === 'expense') {
    return category.budgetAmount != null ? (
      <Won value={category.budgetAmount} className="text-[12.5px] text-ink2" />
    ) : (
      <span className="text-[11px] text-ink3">예산 없음</span>
    )
  }
  if (category.type === 'saving') {
    return category.goalAmount != null ? (
      <Won value={category.goalAmount} className="text-[12.5px] text-ink2" />
    ) : (
      <span className="text-[11px] text-ink3">목표 없음</span>
    )
  }
  return <span className="text-[11px] text-ink3">목표 없음</span>
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
    >
      {dir === 'up' ? <path d="M3 7l4-4 4 4" /> : <path d="M3 3l4 4 4-4" />}
    </svg>
  )
}
