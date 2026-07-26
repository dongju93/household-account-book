import { useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import {
  categoryExpenseBreakdown,
  groupTransactionsByMonth,
  monthlyCategoryStacks,
  monthlyTrend,
  REPORT_PERIODS,
  type ReportPeriodMonths,
} from '../../domain/reports'
import { currentYearMonth, lastMonths, monthWindowRange } from '../../lib/month'
import { AppBar, Chip, ErrorBanner, ReportsSkeleton, ScreenBody } from '../../ui'
import { useStatsQnaTools } from '../../webmcp/useStatsQnaTools'
import { ReportsCharts } from './ReportsCharts'

// Widest window any qna_* tool can be asked for (periodMonths enum = REPORT_PERIODS).
const MATERIALIZE_MONTHS = REPORT_PERIODS[REPORT_PERIODS.length - 1]

export function ReportsPage() {
  useDocumentTitle('통계')
  const { ledgerId } = useLedger()
  const { version } = useRefresh()
  const [period, setPeriod] = useState<ReportPeriodMonths>(6)

  const anchor = currentYearMonth()
  const months = lastMonths(anchor, period)
  const { start, endExclusive } = monthWindowRange(anchor, period)

  const { data, loading, error } = useAsyncData(async () => {
    if (!ledgerId) return null
    // Materialize the MAX window (not just the displayed `period`) so the qna_*
    // tools can safely answer any periodMonths without reading un-materialized
    // recurring rows; the display fetch below stays scoped to `period`.
    await materializeMonths(ledgerId, lastMonths(anchor, MATERIALIZE_MONTHS))
    const [txns, categories] = await Promise.all([
      fetchTransactionsInRange(ledgerId, start, endExclusive),
      listCategories(ledgerId),
    ])
    return { txns, categories }
  }, [ledgerId, period, version])

  // Gate the qna_* tools until this screen has finished materializing the max
  // window for the current (ledgerId, version); closes the mount-time race where
  // tools are exposed synchronously before the async materialize resolves.
  const ready = !loading && !error && data != null
  useStatsQnaTools(period, ready)

  const txns = data?.txns ?? []
  const categories = data?.categories ?? []

  const byMonth = groupTransactionsByMonth(months, txns)
  const trend = monthlyTrend(byMonth)
  const breakdown = categoryExpenseBreakdown(categories, txns)
  const { points: stackPoints, series: stackSeries } = monthlyCategoryStacks(categories, byMonth, 4)
  const hasStackedExpense = stackPoints.some((p) => stackSeries.some((s) => Number(p[s.key]) > 0))

  return (
    <>
      <AppBar title="통계" center />
      <ScreenBody className="flex flex-col gap-3">
        {/* §6.6 keeps the 3·6·12 selector as-is; the group only gains an
            accessible name so the chips are announced as one control. */}
        <div role="group" aria-label="집계 기간" className="flex gap-2">
          {REPORT_PERIODS.map((p) => (
            <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p}개월
            </Chip>
          ))}
        </div>

        {loading && <ReportsSkeleton />}
        {error && (
          <ErrorBanner
            message={error.message}
            variant={error.permission ? 'permission' : 'error'}
          />
        )}

        {!loading && !error && (
          <ReportsCharts
            trend={trend}
            breakdown={breakdown}
            stackPoints={stackPoints}
            stackSeries={stackSeries}
            hasStackedExpense={hasStackedExpense}
          />
        )}
      </ScreenBody>
    </>
  )
}
