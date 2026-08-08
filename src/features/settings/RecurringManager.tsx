import { useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { listCategories } from '../../data/categories'
import { listRecurring, setRecurringActive } from '../../data/recurring'
import { fundTypeLabel } from '../../domain/fundType'
import { suggestRecurringItems } from '../../domain/recurringSuggestions'
import type { Transaction } from '../../domain/types'
import { Pill, TextAction, Toggle, Won } from '../../ui'
import { type RecurringFormTarget, RecurringFormSheet } from './RecurringFormSheet'
import { SettingsSection } from './SettingsSection'
import { useManagedList } from './useManagedList'

export function RecurringManager({
  ledgerId,
  canEdit,
  historyTransactions = [],
}: {
  ledgerId: string
  canEdit: boolean
  historyTransactions?: readonly Transaction[]
}) {
  const { refresh } = useRefresh()
  const { data, loading, error, reload } = useAsyncData(async () => {
    const [items, categories] = await Promise.all([
      listRecurring(ledgerId),
      listCategories(ledgerId, { activeOnly: true }),
    ])
    return { items, categories }
  }, [ledgerId])
  const [formTarget, setFormTarget] = useState<RecurringFormTarget>({ kind: 'create' })
  const { sheetOpen, setSheetOpen, actionError, openCreate, closeSheet, afterMutation, run } =
    useManagedList(refresh)

  const items = data?.items ?? []
  const categories = data?.categories ?? []
  const suggestions = canEdit
    ? suggestRecurringItems(historyTransactions, categories, items).slice(0, 3)
    : []

  return (
    <>
      <SettingsSection
        title="고정 항목"
        description="매월 자동으로 기록되는 항목입니다. 월을 열면 그 달의 거래로 만들어집니다."
        canAdd={canEdit}
        onAdd={() => {
          setFormTarget({ kind: 'create' })
          openCreate()
        }}
        actionError={actionError}
        loading={loading}
        error={error}
        empty={
          items.length === 0 && suggestions.length === 0
            ? {
                title: '고정 항목이 없습니다',
                description: '매월 반복되는 수입·지출·저축·투자를 등록하세요.',
              }
            : null
        }
      >
        {suggestions.length > 0 && (
          <div
            role="region"
            aria-label="고정 항목 추천"
            className="border-b border-line-soft bg-fill1 px-3 py-3"
          >
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-body font-semibold text-ink">추천 {suggestions.length}건</p>
                <p className="text-caption mt-0.5 text-ink2 text-pretty">
                  최근 6개월의 반복 기록에서 찾은 참고용 초안입니다. 저장 전 내용을 확인하세요.
                </p>
              </div>
            </div>
            <div className="mt-2 flex flex-col gap-1">
              {suggestions.map((suggestion) => (
                <div
                  key={`${suggestion.categoryId}:${suggestion.name}:${suggestion.amount}:${suggestion.dayOfMonth}`}
                  className="flex min-h-12 items-center gap-2 rounded-control bg-paper px-2.5 py-2"
                >
                  <span className="min-w-0 flex-1">
                    <span className="text-body block truncate font-semibold text-ink">
                      {suggestion.name}
                    </span>
                    <span className="text-caption block text-ink2">
                      {suggestion.months.length}개월 · 매월 {suggestion.dayOfMonth}일 ·{' '}
                      <Won value={suggestion.amount} />
                    </span>
                  </span>
                  <TextAction
                    aria-label={`${suggestion.name} 고정 항목 초안 확인`}
                    className="min-h-12"
                    onClick={() => {
                      setFormTarget({ kind: 'suggestion', suggestion })
                      setSheetOpen(true)
                    }}
                  >
                    초안 확인
                  </TextAction>
                </div>
              ))}
            </div>
          </div>
        )}

        {items.map((item) => (
          <div
            key={item.id}
            className={
              'flex items-center gap-2 border-b border-line-soft px-2 py-2 last:border-b-0 ' +
              (item.isActive ? '' : 'opacity-60')
            }
          >
            {/* §6.7: the edit target stops short of the toggle so the two
                actions no longer share an edge. */}
            <button
              type="button"
              onClick={() => {
                if (canEdit) {
                  setFormTarget({ kind: 'edit', item })
                  setSheetOpen(true)
                }
              }}
              disabled={!canEdit}
              className="pressable flex min-h-12 min-w-0 flex-1 items-center gap-2 rounded-control px-1 text-left enabled:hover:bg-fill1"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                <span className="flex items-center gap-1.5">
                  <span className="text-body truncate font-semibold text-ink">{item.name}</span>
                  <Pill tone="ink">{fundTypeLabel(item.type)}</Pill>
                </span>
                <span className="tnum text-caption text-ink2">
                  매월 {item.dayOfMonth}일 · {item.startMonth.slice(0, 7)}
                  {item.endMonth ? ` ~ ${item.endMonth.slice(0, 7)}` : ' ~'}
                </span>
              </span>
              <Won value={item.amount} className="text-body flex-none text-ink" />
            </button>

            {canEdit && (
              <Toggle
                on={item.isActive}
                onChange={(on) => run(() => setRecurringActive(item.id, ledgerId, on), reload)}
                label={`${item.name} 활성화`}
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
          target={formTarget}
          categories={categories}
          onSaved={() => afterMutation(reload)}
        />
      )}
    </>
  )
}
