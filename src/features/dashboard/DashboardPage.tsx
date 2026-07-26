import { useState } from 'react'

import { buildMonthInsightInput } from '../../ai/buildMonthInsightInput'
import { useAsyncData } from '../../app/useAsyncData'
import { useDocumentTitle } from '../../app/useDocumentTitle'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import { computeAchievements } from '../../domain/achievement'
import {
  budgetPaceRowsWithStatus,
  computeBudgetPaceRows,
  paceByCategoryId,
} from '../../domain/budgetPace'
import { computeMonthSummary } from '../../domain/monthSummary'
import {
  categoryExpenseBreakdown,
  groupTransactionsByMonth,
  monthlyTrend,
} from '../../domain/reports'
import { addMonths, currentYearMonth, monthRange, todayISO } from '../../lib/month'
import { AppBar, DashboardSkeleton, ErrorBanner, MonthNav, ScreenBody } from '../../ui'
import { useBudgetPaceTools } from '../../webmcp/useBudgetPaceTools'
import { AchievementList } from './AchievementList'
import { AiInsightCard } from './AiInsightCard'
import { DashboardCharts } from './DashboardCharts'
import { MonthCloseSection } from './MonthCloseSection'
import { SummaryCards } from './SummaryCards'

const TREND_MONTHS = 6

export function DashboardPage() {
  useDocumentTitle('대시보드')
  useBudgetPaceTools()
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
  const paceRows = computeBudgetPaceRows(activeCategories, selTxns, ym, today)
  const paceLookup = paceByCategoryId(paceRows)
  const now = currentYearMonth()
  const showPace = ym.year === now.year && ym.month === now.month
  const breakdown = categoryExpenseBreakdown(categories, selTxns)

  // Aggregates only — raw transactions never leave the client (spec §5.3).
  const insightInput = buildMonthInsightInput({
    ym,
    summary,
    achievements,
    paceRows: showPace ? budgetPaceRowsWithStatus(paceRows, ym) : undefined,
    breakdown,
  })

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
      <ScreenBody className="flex flex-col gap-6">
        {loading && <DashboardSkeleton />}
        {error && (
          <ErrorBanner
            message={error.message}
            variant={error.permission ? 'permission' : 'error'}
          />
        )}
        {/*
          §6.3 running order: 상태 파악 → 조정할 항목 → 조언 → 상세 분석.
          Previously the AI card and the close review sat between the summary and
          the achievements, so the reader crossed two advisory blocks before
          reaching the thing they could act on. Numbers now run first, the two
          AI-authored surfaces sit together after them, and the charts close.
          Month gating is unchanged: pace hints only in the current month,
          월 마감 점검 only in past months (it self-gates on `ym`).
        */}
        {!loading && !error && (
          <>
            <SummaryCards summary={summary} />
            <AchievementList
              rows={achievements}
              paceByCategoryId={paceLookup}
              isCurrentMonth={showPace}
            />
            {ledgerId && <MonthCloseSection ledgerId={ledgerId} ym={ym} />}
            {ledgerId && <AiInsightCard ledgerId={ledgerId} input={insightInput} />}
            <DashboardCharts breakdown={breakdown} summary={summary} trend={trend} />
          </>
        )}
      </ScreenBody>
    </>
  )
}
