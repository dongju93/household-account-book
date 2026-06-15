import { useState } from 'react'
import {
  Bar,
  BarChart,
  Cell,
  Label,
  LabelList,
  Pie,
  PieChart,
  ResponsiveContainer,
  XAxis,
  YAxis,
} from 'recharts'

import type { MonthSummary } from '../../domain/monthSummary'
import type { CategoryBreakdownRow, MonthlyTrendPoint } from '../../domain/reports'
import { compactWon } from '../../lib/format'
import { BalanceTrendChart, Card, EmptyState, FUND_CHART_COLORS } from '../../ui'
import {
  CHART_PALETTE,
  ChartCardHeader,
  ChartGrid,
  ChartLegend,
  DonutCenterLabel,
  RechartsTooltip,
  chartYAxisProps,
} from '../../ui/charts'

export function DashboardCharts({
  breakdown,
  summary,
  trend,
}: {
  breakdown: CategoryBreakdownRow[]
  summary: MonthSummary
  trend: MonthlyTrendPoint[]
}) {
  const [activeSlice, setActiveSlice] = useState<number | undefined>(undefined)
  const totalExpense = breakdown.reduce((sum, row) => sum + row.amount, 0)

  const typeData = [
    { name: '수입', value: summary.totalIncome, fill: FUND_CHART_COLORS.income },
    { name: '지출', value: summary.totalExpense, fill: FUND_CHART_COLORS.expense },
    { name: '저축', value: summary.totalSaving, fill: FUND_CHART_COLORS.saving },
    { name: '투자', value: summary.totalInvestment, fill: FUND_CHART_COLORS.investment },
  ]
  const hasType = typeData.some((d) => d.value > 0)

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <ChartCardHeader title="지출 카테고리 비중" />
        {breakdown.length === 0 ? (
          <EmptyState title="지출 내역이 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="amount"
                nameKey="name"
                innerRadius={52}
                outerRadius={78}
                paddingAngle={2}
                onMouseEnter={(_, i) => setActiveSlice(i)}
                onMouseLeave={() => setActiveSlice(undefined)}
              >
                {breakdown.map((row, i) => (
                  <Cell
                    key={row.categoryId}
                    fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                    opacity={activeSlice == null || activeSlice === i ? 1 : 0.45}
                  />
                ))}
              </Pie>
              <RechartsTooltip showPct />
              <Label
                position="center"
                content={({ viewBox }) => {
                  const { cx, cy } = viewBox as { cx?: number; cy?: number }
                  return (
                    <DonutCenterLabel
                      cx={cx}
                      cy={cy}
                      title="총 지출"
                      value={compactWon(totalExpense)}
                    />
                  )
                }}
              />
            </PieChart>
          </ResponsiveContainer>
        )}
        {breakdown.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
            {breakdown.slice(0, 6).map((row, i) => (
              <span
                key={row.categoryId}
                className="flex items-center gap-1.5 text-[11px] text-ink2"
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
                />
                {row.name} {row.pct}%
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <ChartCardHeader title="구분별 월 합계" />
        {!hasType ? (
          <EmptyState title="이번 달 거래가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <BarChart data={typeData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <ChartGrid />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#736d65' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis {...chartYAxisProps} />
              <RechartsTooltip />
              <Bar dataKey="value" radius={[5, 5, 0, 0]} maxBarSize={48}>
                {typeData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
                <LabelList
                  dataKey="value"
                  position="top"
                  formatter={(v) => compactWon(Number(v))}
                  className="tnum"
                  style={{ fontSize: 10, fill: '#736d65', fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <BalanceTrendChart
        trend={trend}
        legend={<ChartLegend items={[{ label: '수지', color: FUND_CHART_COLORS.balance }]} />}
      />
    </div>
  )
}
