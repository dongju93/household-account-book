import { useState } from 'react'

import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import { computeAchievements } from '../../domain/achievement'
import { computeBudgetPaceRows, paceByCategoryId } from '../../domain/budgetPace'
import { computeMonthSummary } from '../../domain/monthSummary'
import {
  categoryExpenseBreakdown,
  groupTransactionsByMonth,
  monthlyTrend,
} from '../../domain/reports'
import { addMonths, currentYearMonth, monthRange, todayISO } from '../../lib/month'
import { AppBar, ErrorBanner, LoadingState, MonthNav, ScreenBody } from '../../ui'
import { AchievementList } from './AchievementList'
import { DashboardCharts } from './DashboardCharts'
import { SummaryCards } from './SummaryCards'

const TREND_MONTHS = 6

export function DashboardPage() {
  const { ledgerId } = useLedger()
  const { version } = useRefresh()
  const [ym, setYm] = useState(currentYearMonth())

  const months = Array.from({ length: TREND_MONTHS }, (_, i) =>
    addMonths(ym, -(TREND_MONTHS - 1 - i)),
  )
  const trendStart = monthRange(months[0].year, months[0].month).start
  const sel = monthRange(ym.year, ym.month)

  const { data, loading, error } = useAsyncData(async () => {
    if (!ledgerId) return null
    await materializeMonths(ledgerId, months)
    const [rangeTxns, categories] = await Promise.all([
      fetchTransactionsInRange(ledgerId, trendStart, sel.endExclusive),
      listCategories(ledgerId),
    ])
    return { rangeTxns, categories }
  }, [ledgerId, ym.year, ym.month, version])

  const rangeTxns = data?.rangeTxns ?? []
  const categories = data?.categories ?? []

  const selTxns = rangeTxns.filter((t) => t.txnDate >= sel.start && t.txnDate < sel.endExclusive)
  const summary = computeMonthSummary(selTxns)
  const activeCategories = categories.filter((c) => c.isActive)
  const achievements = computeAchievements(activeCategories, selTxns).filter(
    (r) => r.target > 0 || r.actual > 0,
  )
  const today = todayISO()
  const paceLookup = paceByCategoryId(computeBudgetPaceRows(activeCategories, selTxns, ym, today))
  const now = currentYearMonth()
  const showPace = ym.year === now.year && ym.month === now.month
  const breakdown = categoryExpenseBreakdown(categories, selTxns)

  const byMonth = groupTransactionsByMonth(months, rangeTxns)
  const trend = monthlyTrend(byMonth)

  return (
    <>
      <AppBar
        title={<span className="sr-only">대시보드</span>}
        left={
          <MonthNav
            value={ym}
            onPrev={() => setYm(addMonths(ym, -1))}
            onNext={() => setYm(addMonths(ym, 1))}
          />
        }
      />
      <ScreenBody className="flex flex-col gap-3.5">
        {loading && <LoadingState />}
        {error && (
          <ErrorBanner
            message={error.message}
            variant={error.permission ? 'permission' : 'error'}
          />
        )}
        {!loading && !error && (
          <>
            <SummaryCards summary={summary} />
            <AchievementList
              rows={achievements}
              paceByCategoryId={paceLookup}
              showPace={showPace}
            />
            <DashboardCharts breakdown={breakdown} summary={summary} trend={trend} />
          </>
        )}
      </ScreenBody>
    </>
  )
}
