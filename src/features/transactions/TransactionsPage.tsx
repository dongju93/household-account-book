import { useEffect, useRef, useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { type DescribedError, describeError } from '../../data/errors'
import { materializeMonth } from '../../data/summary'
import { deleteTransaction, listTransactions, type TxnCursor } from '../../data/transactions'
import type { FundType } from '../../domain/fundType'
import { FUND_TYPES, fundTypeLabel } from '../../domain/fundType'
import type { Transaction } from '../../domain/types'
import { won } from '../../lib/format'
import { addMonths, currentYearMonth, formatDayHeader, monthKey, monthRange } from '../../lib/month'
import {
  AppBar,
  Button,
  Chip,
  EmptyState,
  ErrorBanner,
  LoadingState,
  MonthNav,
  ScreenBody,
} from '../../ui'
import { TransactionSheet } from './TransactionSheet'
import { TxnRow } from './TxnRow'

interface DateGroup {
  date: string
  rows: Transaction[]
  net: number
}

function groupByDate(rows: Transaction[]): DateGroup[] {
  const groups: DateGroup[] = []
  let current: DateGroup | null = null
  for (const r of rows) {
    if (!current || current.date !== r.txnDate) {
      current = { date: r.txnDate, rows: [], net: 0 }
      groups.push(current)
    }
    current.rows.push(r)
    current.net += r.type === 'income' ? r.amount : -r.amount
  }
  return groups
}

export function TransactionsPage() {
  const { ledgerId } = useLedger()
  const { version, refresh } = useRefresh()

  const [ym, setYm] = useState(currentYearMonth())
  const [type, setType] = useState<FundType | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)

  // debounce the keyword search so we don't query on every keystroke
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // all categories (incl. inactive) for name display; active subset for filters
  const catState = useAsyncData(
    () => (ledgerId ? listCategories(ledgerId) : Promise.resolve([])),
    [ledgerId, version],
  )
  const allCategories = catState.data ?? []
  const activeCategories = allCategories.filter((c) => c.isActive)
  const nameById = new Map(allCategories.map((c) => [c.id, c.name]))
  const iconById = new Map(allCategories.map((c) => [c.id, c.icon]))

  const [rows, setRows] = useState<Transaction[]>([])
  const [cursor, setCursor] = useState<TxnCursor | null>(null)
  const [loadingMore, setLoadingMore] = useState(false)
  const [listError, setListError] = useState<DescribedError | null>(null)
  const materializedRef = useRef<string | null>(null)

  const range = monthRange(ym.year, ym.month)
  const buildFilter = () => ({
    start: range.start,
    endExclusive: range.endExclusive,
    type,
    categoryId,
    search,
  })

  const listKey = ledgerId
    ? `${ledgerId}:${ym.year}:${ym.month}:${type}:${categoryId}:${search}:${version}`
    : null
  const [syncedKey, setSyncedKey] = useState(listKey)
  const [fetchedKey, setFetchedKey] = useState<string | null>(null)
  if (syncedKey !== listKey) {
    setSyncedKey(listKey)
    setListError(null)
  }
  const listLoading = listKey !== null && fetchedKey !== listKey

  // load the first page whenever the month, filters or data version change
  // syncedKey captures all list inputs
  // oxlint-disable-next-line react/exhaustive-deps
  useEffect(() => {
    if (!ledgerId || syncedKey === null) return
    let active = true
    void (async () => {
      try {
        // materialize the month's recurring rows once per month+version
        const matKey = `${monthKey(ym.year, ym.month)}:${version}`
        if (materializedRef.current !== matKey) {
          await materializeMonth(ledgerId, ym)
          materializedRef.current = matKey
        }
        const page = await listTransactions(ledgerId, buildFilter())
        if (!active) return
        setRows(page.rows)
        setCursor(page.nextCursor)
        setListError(null)
        setFetchedKey(syncedKey)
      } catch (err) {
        if (active) {
          setListError(describeError(err))
          setFetchedKey(syncedKey)
        }
      }
    })()
    return () => {
      active = false
    }
  }, [syncedKey])

  async function loadMore() {
    if (!ledgerId || !cursor) return
    setLoadingMore(true)
    try {
      const page = await listTransactions(ledgerId, buildFilter(), cursor)
      setRows((prev) => [...prev, ...page.rows])
      setCursor(page.nextCursor)
    } catch (err) {
      setListError(describeError(err))
    } finally {
      setLoadingMore(false)
    }
  }

  async function handleDelete(txn: Transaction) {
    await deleteTransaction({
      id: txn.id,
      ledgerId: txn.ledgerId,
      source: txn.source,
      recurringId: txn.recurringId,
      occurrenceMonth: txn.occurrenceMonth,
    })
    setEditing(null)
    refresh()
  }

  function selectType(next: FundType | null) {
    setType(next)
    setCategoryId(null) // reset category when 구분 changes
  }

  const groups = groupByDate(rows)

  return (
    <>
      <AppBar
        left={
          <MonthNav
            value={ym}
            onPrev={() => setYm(addMonths(ym, -1))}
            onNext={() => setYm(addMonths(ym, 1))}
          />
        }
        title="내역"
        center
      />
      <ScreenBody>
        {/* filters */}
        <div className="mb-2 flex flex-col gap-2">
          <input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="메모 검색"
            className="w-full rounded-[12px] border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          />
          <div className="flex gap-1.5 overflow-x-auto pb-1">
            <Chip active={type === null} onClick={() => selectType(null)}>
              전체
            </Chip>
            {FUND_TYPES.map((t) => (
              <Chip key={t} active={type === t} onClick={() => selectType(t)}>
                {fundTypeLabel(t)}
              </Chip>
            ))}
          </div>
          <select
            value={categoryId ?? ''}
            onChange={(e) => setCategoryId(e.target.value || null)}
            className="w-full rounded-[12px] border border-line bg-paper px-3 py-2 text-sm outline-none focus:border-ink"
          >
            <option value="">전체 카테고리</option>
            {activeCategories
              .filter((c) => !type || c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </select>
        </div>

        {listLoading && <LoadingState />}
        {listError && (
          <ErrorBanner
            message={listError.message}
            variant={listError.permission ? 'permission' : 'error'}
          />
        )}
        {!listLoading && !listError && rows.length === 0 && (
          <EmptyState
            title="거래가 없습니다"
            description="＋ 버튼으로 이 달의 거래를 추가해 보세요."
          />
        )}

        {!listLoading &&
          !listError &&
          groups.map((g) => (
            <div key={g.date}>
              <div className="flex items-center justify-between pt-2.5 pb-1">
                <span className="text-xs font-bold text-ink2">{formatDayHeader(g.date)}</span>
                <span className="tnum text-[11px] text-ink3">{won(g.net, true)}</span>
              </div>
              {g.rows.map((txn) => (
                <TxnRow
                  key={txn.id}
                  txn={txn}
                  categoryName={nameById.get(txn.categoryId) ?? '카테고리'}
                  categoryIcon={iconById.get(txn.categoryId)}
                  onClick={() => setEditing(txn)}
                />
              ))}
            </div>
          ))}

        {!listLoading && !listError && cursor && (
          <div className="pt-3">
            <Button variant="ghost" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? '불러오는 중…' : '더 보기'}
            </Button>
          </div>
        )}
      </ScreenBody>

      {editing && ledgerId && (
        <TransactionSheet
          open
          onClose={() => setEditing(null)}
          ledgerId={ledgerId}
          transaction={editing}
          categories={activeCategories}
          onSaved={refresh}
          onDelete={() => handleDelete(editing)}
        />
      )}
    </>
  )
}
