import { useState } from 'react'
import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { listCategories } from '../../data/categories'
import { describeError } from '../../data/errors'
import { listRecurring, setRecurringActive } from '../../data/recurring'
import { fundTypeLabel } from '../../domain/fundType'
import type { RecurringItem } from '../../domain/types'
import { Card, EmptyState, ErrorBanner, LoadingState, Pill, Toggle, Won } from '../../ui'
import { RecurringFormSheet } from './RecurringFormSheet'

export function RecurringManager({ ledgerId, canEdit }: { ledgerId: string; canEdit: boolean }) {
  const { refresh } = useRefresh()
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [items, categories] = await Promise.all([
      listRecurring(ledgerId),
      listCategories(ledgerId, { activeOnly: true }),
    ])
    return { items, categories }
  }, [ledgerId])
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editing, setEditing] = useState<RecurringItem | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  function afterMutation() {
    setSheetOpen(false)
    reload()
    refresh() // recurring changes affect materialized months
  }

  async function toggle(item: RecurringItem, on: boolean) {
    try {
      setActionError(null)
      await setRecurringActive(item.id, on)
      reload()
      refresh()
    } catch (err) {
      setActionError(describeError(err).message)
    }
  }

  const items = data?.items ?? []
  const categories = data?.categories ?? []

  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between px-0.5">
        <span className="text-[12.5px] font-bold text-ink2">고정 항목</span>
        {canEdit && (
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
        {!loading && !error && items.length === 0 && (
          <EmptyState
            title="고정 항목이 없습니다"
            description="매월 반복되는 수입·지출·저축·투자를 등록하세요."
          />
        )}
        {!loading &&
          !error &&
          items.map((item) => (
            <div
              key={item.id}
              className={
                'flex items-center gap-2.5 border-b border-line-soft px-3 py-2.5 last:border-b-0 ' +
                (item.isActive ? '' : 'opacity-55')
              }
            >
              <button
                type="button"
                onClick={() => {
                  if (canEdit) {
                    setEditing(item)
                    setSheetOpen(true)
                  }
                }}
                className="flex flex-1 flex-col items-start gap-1 text-left"
              >
                <span className="flex items-center gap-2">
                  <span className="text-sm font-semibold">{item.name}</span>
                  <Pill tone="ink">{fundTypeLabel(item.type)}</Pill>
                </span>
                <span className="text-[11px] text-ink3">
                  매월 {item.dayOfMonth}일 · {item.startMonth.slice(0, 7)}
                  {item.endMonth ? ` ~ ${item.endMonth.slice(0, 7)}` : ' ~'}
                </span>
              </button>

              <Won value={item.amount} className="text-[12.5px] text-ink2" />
              {canEdit && <Toggle on={item.isActive} onChange={(on) => toggle(item, on)} />}
            </div>
          ))}
      </Card>

      {sheetOpen && (
        <RecurringFormSheet
          open={sheetOpen}
          onClose={() => setSheetOpen(false)}
          ledgerId={ledgerId}
          item={editing}
          categories={categories}
          onSaved={afterMutation}
        />
      )}
    </section>
  )
}
