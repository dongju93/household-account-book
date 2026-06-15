import { useState } from 'react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  ComposedChart,
  LabelList,
  Line,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import { categoryExpenseBreakdown, monthlyCategoryStacks, monthlyTrend } from '../../domain/reports'
import type { Transaction } from '../../domain/types'
import { addMonths, currentYearMonth, monthKey, monthRange } from '../../lib/month'
import { AppBar, Card, Chip, EmptyState, ErrorBanner, LoadingState, ScreenBody } from '../../ui'
import {
  CHART_PALETTE,
  ChartCardHeader,
  ChartDefs,
  ChartGrid,
  ChartLegend,
  ChartZeroLine,
  FUND_CHART_COLORS,
  RechartsTooltip,
  chartXAxisProps,
  chartYAxisProps,
} from '../../ui/charts'

const PERIODS = [3, 6, 12] as const

const FUND_SERIES = [
  { key: '수입', color: FUND_CHART_COLORS.income },
  { key: '지출', color: FUND_CHART_COLORS.expense },
  { key: '저축', color: FUND_CHART_COLORS.saving },
  { key: '투자', color: FUND_CHART_COLORS.investment },
] as const

export function ReportsPage() {
  const { ledgerId } = useLedger()
  const { version } = useRefresh()
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(6)

  const anchor = currentYearMonth()
  const months = Array.from({ length: period }, (_, i) => addMonths(anchor, -(period - 1 - i)))
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

  const byMonth = new Map<string, Transaction[]>()
  for (const m of months) byMonth.set(monthKey(m.year, m.month), [])
  for (const t of txns) byMonth.get(t.txnDate.slice(0, 7))?.push(t)

  const trend = monthlyTrend(byMonth)
  const breakdown = categoryExpenseBreakdown(categories, txns)
  const { points: stackPoints, series: stackSeries } = monthlyCategoryStacks(categories, byMonth, 4)
  const hasStackedExpense = stackPoints.some((p) => stackSeries.some((s) => Number(p[s.key]) > 0))

  const trendData = trend.map((t) => ({
    label: `${Number(t.month.slice(5, 7))}월`,
    수입: t.totalIncome,
    지출: t.totalExpense,
    저축: t.totalSaving,
    투자: t.totalInvestment,
    수지: t.balance,
    stroke: t.balance >= 0 ? FUND_CHART_COLORS.saving : FUND_CHART_COLORS.expense,
  }))
  const balanceFill =
    (trendData.at(-1)?.수지 ?? 0) >= 0 ? 'url(#balanceGradientPos)' : 'url(#balanceGradientNeg)'

  return (
    <>
      <AppBar title="통계" center />
      <ScreenBody className="flex flex-col gap-3.5">
        <div className="flex gap-1.5">
          {PERIODS.map((p) => (
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
          <>
            <Card>
              <ChartCardHeader
                title="월별 추세"
                legend={
                  <ChartLegend items={FUND_SERIES.map((s) => ({ label: s.key, color: s.color }))} />
                }
              />
              <ResponsiveContainer width="100%" height={210}>
                <ComposedChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <ChartGrid />
                  <XAxis dataKey="label" {...chartXAxisProps} />
                  <YAxis {...chartYAxisProps} />
                  <RechartsTooltip />
                  {FUND_SERIES.map((s) => (
                    <Area
                      key={s.key}
                      type="monotone"
                      dataKey={s.key}
                      stroke={s.color}
                      fill={s.color}
                      fillOpacity={0.08}
                      strokeWidth={2}
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 0 }}
                    />
                  ))}
                  <Line
                    type="monotone"
                    dataKey="수지"
                    stroke={FUND_CHART_COLORS.balance}
                    strokeWidth={2.2}
                    strokeDasharray="4 3"
                    dot={{ r: 2.5, fill: FUND_CHART_COLORS.balance }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <ChartCardHeader title="월별 수지 추세" />
              <ResponsiveContainer width="100%" height={190}>
                <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <ChartDefs />
                  <ChartGrid />
                  <XAxis dataKey="label" {...chartXAxisProps} />
                  <YAxis {...chartYAxisProps} />
                  <ChartZeroLine />
                  <RechartsTooltip />
                  <Area
                    type="monotone"
                    dataKey="수지"
                    name="수지"
                    stroke={FUND_CHART_COLORS.balance}
                    strokeWidth={2.4}
                    fill={balanceFill}
                    dot={(props) => {
                      const { cx, cy, payload } = props
                      if (cx == null || cy == null) return null
                      const color =
                        (payload as { stroke?: string }).stroke ?? FUND_CHART_COLORS.balance
                      return (
                        <circle
                          cx={cx}
                          cy={cy}
                          r={3}
                          fill={color}
                          stroke="#fff"
                          strokeWidth={1.5}
                        />
                      )
                    }}
                    activeDot={{ r: 5, strokeWidth: 0 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <ChartCardHeader
                title="월별 지출 구성"
                legend={
                  <ChartLegend
                    items={stackSeries.map((s, i) => ({
                      label: s.name,
                      color: CHART_PALETTE[i % CHART_PALETTE.length],
                    }))}
                  />
                }
              />
              {!hasStackedExpense ? (
                <EmptyState title="이 기간의 지출이 없습니다" />
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={stackPoints} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <ChartGrid />
                    <XAxis dataKey="label" {...chartXAxisProps} />
                    <YAxis {...chartYAxisProps} />
                    <RechartsTooltip />
                    {stackSeries.map((s, i) => (
                      <Bar
                        key={s.key}
                        dataKey={s.key}
                        stackId="expense"
                        fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                        radius={i === stackSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                        maxBarSize={40}
                      />
                    ))}
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card>
              <ChartCardHeader title="카테고리별 지출 비교" />
              {breakdown.length === 0 ? (
                <EmptyState title="이 기간의 지출이 없습니다" />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(140, breakdown.length * 38)}>
                  <BarChart
                    data={breakdown}
                    layout="vertical"
                    margin={{ top: 0, right: 36, left: 4, bottom: 0 }}
                  >
                    <ChartGrid horizontal={false} />
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={68}
                      tick={{ fontSize: 11, fill: '#736d65' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <RechartsTooltip showPct />
                    <Bar dataKey="amount" radius={[0, 5, 5, 0]} maxBarSize={22}>
                      {breakdown.map((row, i) => (
                        <Cell key={row.categoryId} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                      ))}
                      <LabelList
                        dataKey="pct"
                        position="right"
                        formatter={(v) => `${v}%`}
                        style={{ fontSize: 10, fill: '#a8a299', fontWeight: 600 }}
                      />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>
          </>
        )}
      </ScreenBody>
    </>
  )
}
