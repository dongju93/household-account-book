import {
  Area,
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

import { monthTrendLabel } from '../../domain/reports'
import type {
  CategoryBreakdownRow,
  CategoryStackSeries,
  MonthlyCategoryStackPoint,
  MonthlyTrendPoint,
} from '../../domain/reports'
import { Card, EmptyState } from '../../ui'
import { BalanceTrendChart } from '../../ui/BalanceTrendChart'
import {
  CHART_PALETTE,
  ChartCardHeader,
  ChartGrid,
  ChartLegend,
  FUND_CHART_COLORS,
  RechartsTooltip,
  chartXAxisProps,
  chartYAxisProps,
} from '../../ui/charts'

const FUND_SERIES = [
  { key: '수입', color: FUND_CHART_COLORS.income },
  { key: '지출', color: FUND_CHART_COLORS.expense },
  { key: '저축', color: FUND_CHART_COLORS.saving },
  { key: '투자', color: FUND_CHART_COLORS.investment },
] as const

export function ReportsCharts({
  trend,
  breakdown,
  stackPoints,
  stackSeries,
  hasStackedExpense,
}: {
  trend: MonthlyTrendPoint[]
  breakdown: CategoryBreakdownRow[]
  stackPoints: MonthlyCategoryStackPoint[]
  stackSeries: CategoryStackSeries[]
  hasStackedExpense: boolean
}) {
  const trendData = trend.map((t) => ({
    label: monthTrendLabel(t.month),
    수입: t.totalIncome,
    지출: t.totalExpense,
    저축: t.totalSaving,
    투자: t.totalInvestment,
    수지: t.balance,
    stroke: t.balance >= 0 ? FUND_CHART_COLORS.saving : FUND_CHART_COLORS.expense,
  }))

  return (
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

      <BalanceTrendChart trend={trend} />

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
  )
}
