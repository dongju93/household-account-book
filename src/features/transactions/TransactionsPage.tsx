import { useEffect, useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { useMaterializedMonth } from '../../app/useMaterializedMonth'
import { usePaginatedList } from '../../app/usePaginatedList'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { type DescribedError, describeError } from '../../data/errors'
import {
  deleteTransaction,
  listAllTransactions,
  listTransactions,
  type TxnCursor,
  type TxnFilter,
} from '../../data/transactions'
import { buildTxnExportRows, txnExportFilename } from '../../domain/exportTransactions'
import type { FundType } from '../../domain/fundType'
import { FUND_TYPES, fundTypeLabel } from '../../domain/fundType'
import { groupTransactionsByDate } from '../../domain/transactionGroups'
import type { Transaction } from '../../domain/types'
import { downloadTxnExportXlsx } from '../../lib/exportXlsx'
import { won } from '../../lib/format'
import { addMonths, currentYearMonth, formatDayHeader, monthRange } from '../../lib/month'
import {
  AppBar,
  Button,
  Chip,
  EmptyState,
  ErrorBanner,
  LoadingState,
  MonthNav,
  ScreenBody,
  Select,
  TextInput,
} from '../../ui'
import { TransactionSheet } from './TransactionSheet'
import { TxnRow } from './TxnRow'

export function TransactionsPage() {
  useDocumentTitle('내역')
  const { ledgerId } = useLedger()
  const { version, refresh } = useRefresh()

  const [ym, setYm] = useState(currentYearMonth())
  const [type, setType] = useState<FundType | null>(null)
  const [categoryId, setCategoryId] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState('')
  const [search, setSearch] = useState('')
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<DescribedError | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setSearch(searchInput.trim()), 300)
    return () => clearTimeout(t)
  }, [searchInput])

  // All categories (incl. inactive) for name display on historical rows.
  const catState = useAsyncData(
    () => (ledgerId ? listCategories(ledgerId) : Promise.resolve([])),
    [ledgerId, version],
  )
  const allCategories = catState.data ?? []
  const activeCategories = allCategories.filter((c) => c.isActive)
  const nameById = new Map(allCategories.map((c) => [c.id, c.name]))
  const iconById = new Map(allCategories.map((c) => [c.id, c.icon]))

  const range = monthRange(ym.year, ym.month)
  const filter: TxnFilter = {
    start: range.start,
    endExclusive: range.endExclusive,
    type,
    categoryId,
    search,
  }

  const ensureMaterialized = useMaterializedMonth(ledgerId, ym, version)
  const listKey = ledgerId
    ? `${ledgerId}:${ym.year}:${ym.month}:${type}:${categoryId}:${search}:${version}`
    : null

  const {
    rows,
    loading,
    loadingMore,
    error: listError,
    hasMore,
    loadMore,
  } = usePaginatedList<Transaction, TxnCursor>({
    listKey,
    beforeLoad: ensureMaterialized,
    loadPage: (cursor) => listTransactions(ledgerId!, filter, cursor),
  })

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
    setCategoryId(null)
  }

  async function handleExport() {
    if (!ledgerId || exporting) return
    setExporting(true)
    setExportError(null)
    try {
      await ensureMaterialized()
      const txns = await listAllTransactions(ledgerId, filter)
      const exportRows = buildTxnExportRows(txns, nameById)
      await downloadTxnExportXlsx(exportRows, txnExportFilename(ym))
    } catch (err) {
      setExportError(describeError(err))
    } finally {
      setExporting(false)
    }
  }

  const groups = groupTransactionsByDate(rows)

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
        right={
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!ledgerId || exporting || loading}
            className="text-[13px] font-semibold text-ink2 transition-colors enabled:hover:text-ink disabled:opacity-40"
          >
            {exporting ? '보내는 중…' : '보내기'}
          </button>
        }
      />
      <ScreenBody>
        <search className="mb-2 flex flex-col gap-2">
          <TextInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="메모 검색"
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
          <Select value={categoryId ?? ''} onChange={(e) => setCategoryId(e.target.value || null)}>
            <option value="">전체 카테고리</option>
            {activeCategories
              .filter((c) => !type || c.type === type)
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
          </Select>
        </search>

        {loading && <LoadingState />}
        {(listError || exportError) && (
          <ErrorBanner
            message={(listError ?? exportError)!.message}
            variant={(listError ?? exportError)!.permission ? 'permission' : 'error'}
          />
        )}
        {!loading && !listError && rows.length === 0 && (
          <EmptyState
            title="거래가 없습니다"
            description="＋ 버튼으로 이 달의 거래를 추가해 보세요."
          />
        )}

        {!loading &&
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

        {!loading && !listError && hasMore && (
          <div className="pt-3">
            <Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore}>
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
