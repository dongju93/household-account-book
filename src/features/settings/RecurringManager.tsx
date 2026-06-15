import { useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { listCategories } from '../../data/categories'
import { listRecurring, setRecurringActive } from '../../data/recurring'
import { fundTypeLabel } from '../../domain/fundType'
import type { RecurringItem } from '../../domain/types'
import { Pill, Toggle, Won } from '../../ui'
import { RecurringFormSheet } from './RecurringFormSheet'
import { SettingsSection } from './SettingsSection'
import { useManagedList } from './useManagedList'

export function RecurringManager({ ledgerId, canEdit }: { ledgerId: string; canEdit: boolean }) {
  const { refresh } = useRefresh()
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [items, categories] = await Promise.all([
      listRecurring(ledgerId),
      listCategories(ledgerId, { activeOnly: true }),
    ])
    return { items, categories }
  }, [ledgerId])
  const [editing, setEditing] = useState<RecurringItem | null>(null)
  const { sheetOpen, setSheetOpen, actionError, openCreate, closeSheet, afterMutation, run } =
    useManagedList(refresh)

  const items = data?.items ?? []
  const categories = data?.categories ?? []

  return (
    <>
      <SettingsSection
        title="고정 항목"
        canAdd={canEdit}
        onAdd={() => {
          setEditing(null)
          openCreate()
        }}
        actionError={actionError}
        loading={loading}
        error={error}
        empty={
          items.length === 0
            ? {
                title: '고정 항목이 없습니다',
                description: '매월 반복되는 수입·지출·저축·투자를 등록하세요.',
              }
            : null
        }
      >
        {items.map((item) => (
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
            {canEdit && (
              <Toggle
                on={item.isActive}
                onChange={(on) => run(() => setRecurringActive(item.id, ledgerId, on), reload)}
              />
            )}
          </div>
        ))}
      </SettingsSection>

      {sheetOpen && (
        <RecurringFormSheet
          open={sheetOpen}
          onClose={closeSheet}
          ledgerId={ledgerId}
          item={editing}
          categories={categories}
          onSaved={() => afterMutation(reload)}
        />
      )}
    </>
  )
}
