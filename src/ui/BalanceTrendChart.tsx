import type { ReactNode } from 'react'
import { Area, AreaChart, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { monthTrendLabel, type MonthlyTrendPoint } from '../domain/reports'
import {
  ChartCardHeader,
  ChartDefs,
  ChartGrid,
  ChartZeroLine,
  FUND_CHART_COLORS,
  RechartsTooltip,
  chartXAxisProps,
  chartYAxisProps,
} from './charts'
import { Card } from './primitives'

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
    <Card>
      <ChartCardHeader title={title} legend={legend} />
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={trendData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
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
              return <circle cx={cx} cy={cy} r={3} fill={color} stroke="#fff" strokeWidth={1.5} />
            }}
            activeDot={{ r: 5, strokeWidth: 0 }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </Card>
  )
}
