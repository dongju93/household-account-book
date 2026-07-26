import type { ReactNode } from 'react'
import type { TooltipContentProps, TooltipPayloadEntry } from 'recharts'
import { CartesianGrid, ReferenceLine, Tooltip } from 'recharts'

import { compactWon, won } from '../lib/format'
import { Card } from './primitives'
import { chartInkHex, toneHex } from './tone'

/*
  Chart chrome (docs/5. frontend-redesign-plan.md §4.1, §6.6, §8).

  The chart count, the series, the aggregation and the order they appear in are
  all unchanged — only the colour source, the type scale and the accessible
  naming are. Before this change the category palette was literally the status
  hexes (#b07360 was 오류, #7d9377 was 정상), so a "지출" slice and an "초과"
  pill were the same red. Every value below now comes from the `Fund *` tokens.
*/

/** Categorical palette for per-category series. Built from the fund hues at
 *  alternating lightness so neighbouring slices separate, and deliberately
 *  disjoint from every `Status *` value. */
export const CHART_PALETTE = [
  toneHex.expense, // #9b6b5d
  toneHex.investment, // #6c7488
  '#8d7f57',
  toneHex.saving, // #6e7d66
  toneHex.income, // #596d73
  '#a98f80',
  '#8a8479',
] as const

export const FUND_CHART_COLORS = {
  income: toneHex.income,
  expense: toneHex.expense,
  saving: toneHex.saving,
  investment: toneHex.investment,
  balance: toneHex.ink,
} as const

type RechartsValue = string | number | ReadonlyArray<string | number>

export function chartWonFormatter(value: RechartsValue | undefined): string {
  return won(Number(Array.isArray(value) ? (value[0] ?? 0) : (value ?? 0)))
}

export function chartCompactAxisTick(value: RechartsValue | undefined): string {
  return compactWon(Number(value ?? 0))
}

// 11px axis ticks are the §4.2 "unavoidable" exception: at 320px width a 12px
// tick either collides with its neighbour or forces the plot area below a
// readable height. The values they label are all repeated in the tooltip at
// caption size, so nothing is only available at 11px.
export const chartXAxisProps = {
  tick: { fontSize: 11, fill: chartInkHex.tick },
  axisLine: false,
  tickLine: false,
} as const

export const chartYAxisProps = {
  tick: { fontSize: 11, fill: chartInkHex.tick },
  axisLine: false,
  tickLine: false,
  tickFormatter: chartCompactAxisTick,
  width: 40,
} as const

export const chartCategoryAxisProps = {
  tick: { fontSize: 11, fill: chartInkHex.label },
  axisLine: false,
  tickLine: false,
} as const

export function ChartGrid({ horizontal = true }: { horizontal?: boolean }) {
  return (
    <CartesianGrid
      stroke={chartInkHex.grid}
      vertical={!horizontal}
      horizontal={horizontal}
      strokeDasharray="3 3"
    />
  )
}

export function ChartZeroLine() {
  return <ReferenceLine y={0} stroke={chartInkHex.rule} strokeWidth={1.5} />
}

type ChartTooltipProps = Pick<TooltipContentProps, 'active' | 'payload' | 'label'> & {
  showPct?: boolean
}

export function ChartTooltip({ active, payload, label, showPct }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-surface border border-line bg-paper px-3 py-2 shadow-raised">
      {label != null && label !== '' && (
        <div className="text-caption mb-1.5 font-semibold text-ink2">{label}</div>
      )}
      <div className="flex flex-col gap-1">
        {payload.map((entry) => (
          <TooltipRow key={String(entry.dataKey)} entry={entry} showPct={showPct} />
        ))}
      </div>
    </div>
  )
}

function TooltipRow({ entry, showPct }: { entry: TooltipPayloadEntry; showPct?: boolean }) {
  const value = Number(entry.value ?? 0)
  const pct = showPct ? (entry.payload as { pct?: number } | undefined)?.pct : undefined

  return (
    <div className="text-caption flex items-center justify-between gap-4">
      <span className="flex items-center gap-1.5 text-ink2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: entry.color ?? entry.fill ?? toneHex.ink }}
        />
        {entry.name}
      </span>
      <span className="tnum font-semibold text-ink">
        {won(value)}
        {pct != null && <span className="ml-1 font-normal text-ink2">{pct}%</span>}
      </span>
    </div>
  )
}

export function ChartLegend({ items }: { items: ReadonlyArray<{ label: string; color: string }> }) {
  return (
    <span className="flex flex-wrap justify-end gap-x-2.5 gap-y-1">
      {items.map(({ label, color }) => (
        <span key={label} className="text-caption flex items-center gap-1 text-ink2">
          <span className="h-[3px] w-3 rounded-full" style={{ background: color }} />
          {label}
        </span>
      ))}
    </span>
  )
}

export function DonutCenterLabel({
  cx,
  cy,
  title,
  value,
}: {
  cx?: number
  cy?: number
  title: string
  value: string
}) {
  if (cx == null || cy == null) return null
  return (
    <text x={cx} y={cy} textAnchor="middle" dominantBaseline="central">
      <tspan x={cx} dy="-0.65em" fill={chartInkHex.label} fontSize={11} fontWeight={600}>
        {title}
      </tspan>
      <tspan x={cx} dy="1.5em" fill={toneHex.ink} fontSize={15} fontWeight={700} className="tnum">
        {value}
      </tspan>
    </text>
  )
}

export function ChartDefs() {
  return (
    <defs>
      <linearGradient id="balanceGradientPos" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={toneHex.saving} stopOpacity={0.3} />
        <stop offset="100%" stopColor={toneHex.saving} stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="balanceGradientNeg" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={toneHex.expense} stopOpacity={0.3} />
        <stop offset="100%" stopColor={toneHex.expense} stopOpacity={0.02} />
      </linearGradient>
    </defs>
  )
}

export function ChartCardHeader({ title, legend }: { title: string; legend?: ReactNode }) {
  return (
    // §11.2: wraps instead of compressing. At 320px a four-series legend left the
    // title too little room and broke it mid-word ("월별 추" / "세"); letting the
    // legend drop to its own line keeps the title on one line at every supported
    // width. They still sit side by side whenever both fit.
    <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h3 className="text-section text-ink">{title}</h3>
      {legend}
    </div>
  )
}

/**
 * Standard frame for every chart on every screen.
 *
 * §8 requires a chart to carry an accessible name and description built from the
 * title and values that are *already computed* — no new data table, no new
 * summary feature. `description` is that sentence; callers pass one assembled
 * from the totals they already render. The plot itself is `role="img"` so a
 * screen reader announces the sentence instead of walking hundreds of SVG nodes.
 *
 * Because `role="img"` hides the subtree from assistive tech, every chart root
 * passes `accessibilityLayer={false}`. Recharts 3 enables that layer by default
 * and it puts `tabIndex={0}` + `role="application"` on the SVG surface, which
 * inside a `role="img"` wrapper produces focus stops that receive keyboard focus
 * but announce nothing — four of them on the dashboard alone. The description
 * below is the accessible representation; the SVG stays out of the tab order.
 */
export function ChartFrame({
  title,
  legend,
  description,
  children,
  className,
}: {
  title: string
  legend?: ReactNode
  description?: string
  children: ReactNode
  className?: string
}) {
  return (
    <Card className={className}>
      <ChartCardHeader title={title} legend={legend} />
      <div role="img" aria-label={description ? `${title}. ${description}` : title}>
        {children}
      </div>
    </Card>
  )
}

export function RechartsTooltip({
  showPct,
}: {
  showPct?: boolean
} = {}) {
  return (
    <Tooltip
      content={(props) => (
        <ChartTooltip
          active={props.active}
          payload={props.payload}
          label={props.label}
          showPct={showPct}
        />
      )}
      cursor={{ stroke: chartInkHex.rule, strokeWidth: 1 }}
    />
  )
}
