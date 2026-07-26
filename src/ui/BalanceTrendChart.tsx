import type { ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { monthTrendLabel, type MonthlyTrendPoint } from '../domain/reports'
import { won } from '../lib/format'
import {
  ChartDefs,
  ChartFrame,
  ChartGrid,
  ChartZeroLine,
  FUND_CHART_COLORS,
  RechartsTooltip,
  chartXAxisProps,
  chartYAxisProps,
} from './charts'
import { chartInkHex } from './tone'

/**
 * §8 accessible description, assembled only from points already plotted — first
 * month, last month and the extremes. No new query, no new aggregate.
 */
function describeTrend(trend: readonly MonthlyTrendPoint[]): string | undefined {
  if (trend.length === 0) return undefined
  const first = trend[0]
  const last = trend[trend.length - 1]
  const high = trend.reduce((a, b) => (b.balance > a.balance ? b : a))
  const low = trend.reduce((a, b) => (b.balance < a.balance ? b : a))
  return (
    `${trend.length}개월 수지. ` +
    `${monthTrendLabel(first.month)} ${won(first.balance)}에서 ` +
    `${monthTrendLabel(last.month)} ${won(last.balance)}. ` +
    `최고 ${monthTrendLabel(high.month)} ${won(high.balance)}, ` +
    `최저 ${monthTrendLabel(low.month)} ${won(low.balance)}.`
  )
}

export function BalanceTrendChart({
  trend,
  title = '월별 수지 추세',
  legend,
  height = 190,
}: {
  trend: readonly MonthlyTrendPoint[]
  title?: string
  legend?: ReactNode
  height?: number
}) {
  const trendData = trend.map((t) => ({
    label: monthTrendLabel(t.month),
    balance: t.balance,
    stroke: t.balance >= 0 ? FUND_CHART_COLORS.saving : FUND_CHART_COLORS.expense,
  }))
  const balanceFill =
    (trendData.at(-1)?.balance ?? 0) >= 0 ? 'url(#balanceGradientPos)' : 'url(#balanceGradientNeg)'

  return (
    <ChartFrame title={title} legend={legend} description={describeTrend(trend)}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart
          accessibilityLayer={false}
          data={trendData}
          margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
        >
          <ChartDefs />
          <ChartGrid />
          <XAxis dataKey="label" {...chartXAxisProps} />
          <YAxis {...chartYAxisProps} />
          <ChartZeroLine />
          <RechartsTooltip />
          <Area
            type="monotone"
            dataKey="balance"
            name="수지"
            stroke={FUND_CHART_COLORS.balance}
            strokeWidth={2.4}
            fill={balanceFill}
            dot={(props) => {
              const { cx, cy, payload } = props
              if (cx == null || cy == null) return null
              const color = (payload as { stroke?: string }).stroke ?? FUND_CHART_COLORS.balance
              return (
                <circle
                  cx={cx}
                  cy={cy}
                  r={3}
                  fill={color}
                  stroke={chartInkHex.surface}
                  strokeWidth={1.5}
                />
              )
            }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </ChartFrame>
  )
}
