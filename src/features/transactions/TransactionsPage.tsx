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
  MonthNav,
  ScreenBody,
  Select,
  TextInput,
  TransactionListSkeleton,
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

  // Reads the *applied* search (debounced), not `searchInput`, so the empty
  // copy never disagrees with the result set it is describing.
  const hasActiveFilter = type !== null || categoryId !== null || search !== ''

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
          // §6.4: "보내기" read like a generic share action. Pairing the label
          // with a document glyph and naming the format makes the outcome — an
          // .xlsx file of the current filter — unambiguous. Same handler.
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!ledgerId || exporting || loading}
            aria-label="엑셀 내보내기"
            className="pressable text-caption flex min-h-11 items-center gap-1.5 rounded-control px-2 font-semibold text-ink2 enabled:hover:bg-fill1 enabled:hover:text-ink disabled:opacity-40"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M11.5 2.5H6a1.5 1.5 0 00-1.5 1.5v12A1.5 1.5 0 006 17.5h8a1.5 1.5 0 001.5-1.5V6.5z" />
              <path d="M11.5 2.5v4h4M8 11l2 2 2-2M10 13V9" />
            </svg>
            {exporting ? '내보내는 중…' : '엑셀'}
          </button>
        }
      />
      <ScreenBody className="flex flex-col gap-4">
        <search className="flex flex-col gap-3">
          <TextInput
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="메모 검색"
            aria-label="메모 검색"
          />
          {/* §6.4: 구분 chips and the category select are one filter region rather
              than two loose rows. Values and behaviour are untouched. */}
          <div
            role="group"
            aria-label="거래 필터"
            className="flex flex-col gap-2.5 rounded-surface border border-line bg-paper p-3"
          >
            {/* §11.2: the chips wrap rather than scroll horizontally. At 320px
                the row needs 298px against 255px of space, so `overflow-x-auto`
                clipped 투자 behind a scrollbar — a hidden filter option is a
                clipped button, which the width criteria rule out. Wrapping to a
                second line keeps every option visible and survives 200% zoom. */}
            <div className="-mx-1 flex flex-wrap gap-2 px-1 pb-0.5">
              <Chip active={type === null} onClick={() => selectType(null)}>
                전체
              </Chip>
              {FUND_TYPES.map((t) => (
                <Chip key={t} active={type === t} onClick={() => selectType(t)}>
                  {fundTypeLabel(t)}
                </Chip>
              ))}
            </div>
            <Select
              aria-label="카테고리"
              value={categoryId ?? ''}
              onChange={(e) => setCategoryId(e.target.value || null)}
            >
              <option value="">전체 카테고리</option>
              {activeCategories
                .filter((c) => !type || c.type === type)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </Select>
          </div>
        </search>

        {loading && <TransactionListSkeleton />}
        {(listError || exportError) && (
          <ErrorBanner
            message={(listError ?? exportError)!.message}
            variant={(listError ?? exportError)!.permission ? 'permission' : 'error'}
          />
        )}
        {/* §13 counts 빈 데이터 and 필터 결과 없음 as two separate states. Showing
            the "add your first transaction" copy while a filter is narrowing a
            month that does have rows tells the user the opposite of the truth,
            so the empty message is chosen by whether a filter is applied. No
            reset affordance here — §12 puts 필터 초기화 out of scope. */}
        {!loading && !listError && rows.length === 0 && (
          <EmptyState
            title={hasActiveFilter ? '조건에 맞는 거래가 없습니다' : '거래가 없습니다'}
            description={
              hasActiveFilter
                ? '검색어나 구분·카테고리 조건을 바꿔 보세요.'
                : '＋ 버튼으로 이 달의 거래를 추가해 보세요.'
            }
          />
        )}

        {!loading &&
          !listError &&
          groups.map((g) => (
            <section key={g.date} className="flex flex-col">
              {/* §6.4 keeps the day header's scroll behaviour; only the weight
                  relationship between date and net changed. `top-0` is the top of
                  ScreenBody, which is the scroll container — the app bar sits
                  outside it and never scrolls. */}
              <div className="sticky top-0 z-[1] -mx-4 flex items-baseline justify-between gap-3 bg-screen px-4 py-2">
                <h2 className="text-caption font-semibold text-ink">{formatDayHeader(g.date)}</h2>
                <span className="tnum text-caption text-ink2">{won(g.net, true)}</span>
              </div>
              <ul>
                {g.rows.map((txn) => (
                  <li key={txn.id}>
                    <TxnRow
                      txn={txn}
                      categoryName={nameById.get(txn.categoryId) ?? '카테고리'}
                      categoryIcon={iconById.get(txn.categoryId)}
                      onClick={() => setEditing(txn)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}

        {!loading && !listError && hasMore && (
          <Button variant="ghost" onClick={() => void loadMore()} disabled={loadingMore}>
            {loadingMore ? '불러오는 중…' : '더 보기'}
          </Button>
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
