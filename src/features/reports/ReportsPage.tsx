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
import { currentYearMonth, lastMonths, monthRange } from '../../lib/month'
import { AppBar, Chip, ErrorBanner, LoadingState, ScreenBody } from '../../ui'
import { useStatsQnaTools } from '../../webmcp/useStatsQnaTools'
import { ReportsCharts } from './ReportsCharts'

export function ReportsPage() {
  useDocumentTitle('통계')
  const { ledgerId } = useLedger()
  const { version } = useRefresh()
  const [period, setPeriod] = useState<ReportPeriodMonths>(6)
  useStatsQnaTools(period)

  const anchor = currentYearMonth()
  const months = lastMonths(anchor, period)
  const start = monthRange(months[0].year, months[0].month).start
  const endExclusive = monthRange(anchor.year, anchor.month).endExclusive

  const { data, loading, error } = useAsyncData(async () => {
    if (!ledgerId) return null
    await materializeMonths(ledgerId, months)
    const [txns, categories] = await Promise.all([
      fetchTransactionsInRange(ledgerId, start, endExclusive),
      listCategories(ledgerId),
    ])
    return { txns, categories }
  }, [ledgerId, period, version])

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
      <ScreenBody className="flex flex-col gap-3.5">
        <div className="flex gap-1.5">
          {REPORT_PERIODS.map((p) => (
            <Chip key={p} active={period === p} onClick={() => setPeriod(p)}>
              {p}개월
            </Chip>
          ))}
        </div>

        {loading && <LoadingState />}
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
