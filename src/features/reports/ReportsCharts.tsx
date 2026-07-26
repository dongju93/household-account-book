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
import { won } from '../../lib/format'
import { EmptyState } from '../../ui'
import { BalanceTrendChart } from '../../ui/BalanceTrendChart'
import {
  CHART_PALETTE,
  ChartFrame,
  ChartGrid,
  ChartLegend,
  FUND_CHART_COLORS,
  RechartsTooltip,
  chartCategoryAxisProps,
  chartXAxisProps,
  chartYAxisProps,
} from '../../ui/charts'
import { chartInkHex } from '../../ui/tone'

/**
 * 통계 (docs/5. frontend-redesign-plan.md §6.6).
 *
 * Four charts, same series, same aggregation, same order — §6.6 explicitly rules
 * out comparison headers, series pickers, previous-period overlays and data
 * tables. The changes are presentational: `Fund *` colours replace the status
 * scale, titles/legends/axes move onto the type scale, and every plot gets an §8
 * accessible description assembled from values already on screen.
 */
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

  const latest = trend.at(-1)

  return (
    <>
      <ChartFrame
        title="월별 추세"
        legend={<ChartLegend items={FUND_SERIES.map((s) => ({ label: s.key, color: s.color }))} />}
        description={
          latest &&
          `${trend.length}개월 수입·지출·저축·투자와 수지. ` +
            `가장 최근 ${monthTrendLabel(latest.month)}: ` +
            `수입 ${won(latest.totalIncome)}, 지출 ${won(latest.totalExpense)}, ` +
            `저축 ${won(latest.totalSaving)}, 투자 ${won(latest.totalInvestment)}, ` +
            `수지 ${won(latest.balance)}.`
        }
      >
        <ResponsiveContainer width="100%" height={210}>
          <ComposedChart
            accessibilityLayer={false}
            data={trendData}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
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
            {/* The 수지 line stays dashed as well as ink-coloured so it separates
                from the four fund series without relying on colour (§8). */}
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
      </ChartFrame>

      <BalanceTrendChart trend={trend} />

      <ChartFrame
        title="월별 지출 구성"
        legend={
          <ChartLegend
            items={stackSeries.map((s, i) => ({
              label: s.name,
              color: CHART_PALETTE[i % CHART_PALETTE.length],
            }))}
          />
        }
        description={
          hasStackedExpense
            ? `${stackPoints.length}개월 지출을 ${stackSeries.map((s) => s.name).join(', ')}(으)로 나눈 누적 막대.`
            : undefined
        }
      >
        {!hasStackedExpense ? (
          <EmptyState title="이 기간의 지출이 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={210}>
            <BarChart
              accessibilityLayer={false}
              data={stackPoints}
              margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
            >
              <ChartGrid />
              <XAxis dataKey="label" {...chartXAxisProps} />
              <YAxis {...chartYAxisProps} />
              <RechartsTooltip />
              {stackSeries.map((s, i) => (
                <Bar
                  key={s.key}
                  dataKey={s.key}
                  name={s.name}
                  stackId="expense"
                  fill={CHART_PALETTE[i % CHART_PALETTE.length]}
                  radius={i === stackSeries.length - 1 ? [4, 4, 0, 0] : [0, 0, 0, 0]}
                  maxBarSize={40}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>

      <ChartFrame
        title="카테고리별 지출 비교"
        description={
          breakdown.length === 0
            ? undefined
            : breakdown.map((r) => `${r.name} ${won(r.amount)} ${r.pct}%`).join(', ')
        }
      >
        {breakdown.length === 0 ? (
          <EmptyState title="이 기간의 지출이 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={Math.max(140, breakdown.length * 40)}>
            <BarChart
              accessibilityLayer={false}
              data={breakdown}
              layout="vertical"
              margin={{ top: 0, right: 40, left: 4, bottom: 0 }}
            >
              <ChartGrid horizontal={false} />
              <XAxis type="number" hide />
              <YAxis type="category" dataKey="name" width={72} {...chartCategoryAxisProps} />
              <RechartsTooltip showPct />
              <Bar dataKey="amount" name="지출" radius={[0, 5, 5, 0]} maxBarSize={22}>
                {breakdown.map((row, i) => (
                  <Cell key={row.categoryId} fill={CHART_PALETTE[i % CHART_PALETTE.length]} />
                ))}
                <LabelList
                  dataKey="pct"
                  position="right"
                  formatter={(v) => `${v}%`}
                  className="tnum"
                  style={{ fontSize: 11, fill: chartInkHex.label, fontWeight: 600 }}
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </ChartFrame>
    </>
  )
}
