import type { ReactNode } from 'react'
import type { TooltipContentProps, TooltipPayloadEntry } from 'recharts'
import { CartesianGrid, ReferenceLine, Tooltip } from 'recharts'

import { compactWon, won } from '../lib/format'
import { toneHex } from './tone'

export const CHART_PALETTE = [
  '#736d65',
  '#b07360',
  '#b09863',
  '#7d9377',
  '#7c87a2',
  '#a8a299',
  '#d6d0c7',
] as const

export const FUND_CHART_COLORS = {
  income: toneHex.neutral,
  expense: toneHex.danger,
  saving: toneHex.ok,
  investment: toneHex.info,
  balance: toneHex.ink,
} as const

export const chartGridStroke = '#e9e5de'

type RechartsValue = string | number | ReadonlyArray<string | number>

export function chartWonFormatter(value: RechartsValue | undefined): string {
  return won(Number(Array.isArray(value) ? (value[0] ?? 0) : (value ?? 0)))
}

export function chartCompactAxisTick(value: RechartsValue | undefined): string {
  return compactWon(Number(value ?? 0))
}

export const chartXAxisProps = {
  tick: { fontSize: 10, fill: '#a8a299' },
  axisLine: false,
  tickLine: false,
} as const

export const chartYAxisProps = {
  tick: { fontSize: 10, fill: '#a8a299' },
  axisLine: false,
  tickLine: false,
  tickFormatter: chartCompactAxisTick,
  width: 36,
} as const

export function ChartGrid({ horizontal = true }: { horizontal?: boolean }) {
  return (
    <CartesianGrid
      stroke={chartGridStroke}
      vertical={!horizontal}
      horizontal={horizontal}
      strokeDasharray="3 3"
    />
  )
}

export function ChartZeroLine() {
  return <ReferenceLine y={0} stroke="#dbd6cf" strokeWidth={1.5} />
}

type ChartTooltipProps = Pick<TooltipContentProps, 'active' | 'payload' | 'label'> & {
  showPct?: boolean
}

export function ChartTooltip({ active, payload, label, showPct }: ChartTooltipProps) {
  if (!active || !payload?.length) return null

  return (
    <div className="rounded-[10px] border border-line bg-paper px-2.5 py-2 shadow-sm">
      {label != null && label !== '' && (
        <div className="mb-1.5 text-[10px] font-semibold text-ink3">{label}</div>
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
    <div className="flex items-center justify-between gap-4 text-[11px]">
      <span className="flex items-center gap-1.5 text-ink2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ background: entry.color ?? entry.fill ?? toneHex.ink }}
        />
        {entry.name}
      </span>
      <span className="tnum font-semibold text-ink">
        {won(value)}
        {pct != null && <span className="ml-1 font-normal text-ink3">{pct}%</span>}
      </span>
    </div>
  )
}

export function ChartLegend({ items }: { items: ReadonlyArray<{ label: string; color: string }> }) {
  return (
    <span className="flex flex-wrap gap-2">
      {items.map(({ label, color }) => (
        <span key={label} className="flex items-center gap-1 text-[10px] text-ink2">
          <span className="h-[3px] w-2.5 rounded" style={{ background: color }} />
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
      <tspan x={cx} dy="-0.6em" fill="#a8a299" fontSize={10} fontWeight={600}>
        {title}
      </tspan>
      <tspan x={cx} dy="1.4em" fill="#39352f" fontSize={12} fontWeight={700} className="tnum">
        {value}
      </tspan>
    </text>
  )
}

export function ChartDefs() {
  return (
    <defs>
      <linearGradient id="balanceGradientPos" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor={toneHex.ok} stopOpacity={0.35} />
        <stop offset="100%" stopColor={toneHex.ok} stopOpacity={0.02} />
      </linearGradient>
      <linearGradient id="balanceGradientNeg" x1="0" y1="1" x2="0" y2="0">
        <stop offset="0%" stopColor={toneHex.danger} stopOpacity={0.35} />
        <stop offset="100%" stopColor={toneHex.danger} stopOpacity={0.02} />
      </linearGradient>
    </defs>
  )
}

export function ChartCardHeader({ title, legend }: { title: string; legend?: ReactNode }) {
  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <span className="text-[13px] font-bold">{title}</span>
      {legend}
    </div>
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
      cursor={{ stroke: '#dbd6cf', strokeWidth: 1 }}
    />
  )
}
