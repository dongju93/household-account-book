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
import { compactWon, won } from '../../lib/format'
import { BalanceTrendChart, EmptyState, SectionHeader } from '../../ui'
import {
  CHART_PALETTE,
  ChartFrame,
  ChartGrid,
  ChartLegend,
  DonutCenterLabel,
  FUND_CHART_COLORS,
  RechartsTooltip,
  chartCategoryAxisProps,
  chartYAxisProps,
} from '../../ui/charts'
import { chartInkHex } from '../../ui/tone'

/**
 * 상세 분석 (docs/5. frontend-redesign-plan.md §6.3, 5번).
 *
 * The three charts, their data and their order are untouched. What changed:
 * surfaces and titles run through `ChartFrame`/`ChartCardHeader` so they sit one
 * level below the hero, series colours come from the `Fund *` tokens instead of
 * the status scale, and each plot carries an §8 accessible description built from
 * figures the card already renders.
 */
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
    <section className="flex flex-col gap-3">
      <SectionHeader title="상세 분석" aside="이번 달" />

      <ChartFrame
        title="지출 카테고리 비중"
        description={
          breakdown.length === 0
            ? undefined
            : `총 지출 ${won(totalExpense)}. ` +
              breakdown
                .slice(0, 6)
                .map((r) => `${r.name} ${won(r.amount)} ${r.pct}%`)
                .join(', ')
        }
      >
        {breakdown.length === 0 ? (
          <EmptyState title="지출 내역이 없습니다" />
        ) : (
          <>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart accessibilityLayer={false}>
                <Pie
                  // Separate from the chart-level accessibilityLayer: Pie puts
                  // its own `rootTabIndex` (default 0) on the sector group, so
                  // it stays a focus stop inside the role="img" wrapper unless
                  // it is opted out too.
                  rootTabIndex={-1}
                  data={breakdown}
                  dataKey="amount"
                  nameKey="name"
                  innerRadius={54}
                  outerRadius={80}
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
            <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1.5">
              {breakdown.slice(0, 6).map((row, i) => (
                <li
                  key={row.categoryId}
                  className="text-caption flex items-center gap-1.5 text-ink2"
                >
                  <span
                    aria-hidden
                    className="h-2.5 w-2.5 flex-none rounded-full"
                    style={{ background: CHART_PALETTE[i % CHART_PALETTE.length] }}
                  />
                  {row.name} <span className="tnum font-semibold text-ink">{row.pct}%</span>
                </li>
              ))}
            </ul>
          </>
        )}
      </ChartFrame>

      <ChartFrame
        title="구분별 월 합계"
        description={
          hasType ? typeData.map((d) => `${d.name} ${won(d.value)}`).join(', ') : undefined
        }
      >
        {!hasType ? (
          <EmptyState title="이번 달 거래가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={190}>
            <BarChart
              accessibilityLayer={false}
              data={typeData}
              margin={{ top: 12, right: 8, left: 0, bottom: 0 }}
            >
              <ChartGrid />
              <XAxis dataKey="name" {...chartCategoryAxisProps} />
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
                  style={{ fontSize: 11, fill: chartInkHex.label, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>

      <BalanceTrendChart
        trend={trend}
        legend={<ChartLegend items={[{ label: '수지', color: FUND_CHART_COLORS.balance }]} />}
      />
    </section>
  )
}
