import {
  Bar,
  BarChart,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
} from 'recharts'
import type { MonthSummary } from '../../domain/monthSummary'
import type { CategoryBreakdownRow, MonthlyTrendPoint } from '../../domain/reports'
import { won } from '../../lib/format'
import { Card, EmptyState } from '../../ui'
import { toneHex } from '../../ui/tone'

// Muted categorical palette for the expense donut.
const DONUT_COLORS = ['#736d65', '#b07360', '#b09863', '#7d9377', '#7c87a2', '#a8a299', '#d6d0c7']

type RechartsValue = string | number | ReadonlyArray<string | number>
const tooltipWon = (value: RechartsValue | undefined): string =>
  won(Number(Array.isArray(value) ? (value[0] ?? 0) : (value ?? 0)))

export function DashboardCharts({
  breakdown,
  summary,
  trend,
}: {
  breakdown: CategoryBreakdownRow[]
  summary: MonthSummary
  trend: MonthlyTrendPoint[]
}) {
  const typeData = [
    { name: '수입', value: summary.totalIncome, fill: toneHex.neutral },
    { name: '지출', value: summary.totalExpense, fill: toneHex.danger },
    { name: '저축', value: summary.totalSaving, fill: toneHex.ok },
    { name: '투자', value: summary.totalInvestment, fill: toneHex.info },
  ]
  const hasType = typeData.some((d) => d.value > 0)
  const trendData = trend.map((t) => ({
    label: `${Number(t.month.slice(5, 7))}월`,
    balance: t.balance,
  }))

  return (
    <div className="flex flex-col gap-3">
      <Card>
        <div className="mb-2 text-[13px] font-bold">지출 카테고리 비중</div>
        {breakdown.length === 0 ? (
          <EmptyState title="지출 내역이 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie
                data={breakdown}
                dataKey="amount"
                nameKey="name"
                innerRadius={45}
                outerRadius={75}
                paddingAngle={2}
              >
                {breakdown.map((row, i) => (
                  <Cell key={row.categoryId} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={tooltipWon} />
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
                  style={{ background: DONUT_COLORS[i % DONUT_COLORS.length] }}
                />
                {row.name} {row.pct}%
              </span>
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="mb-2 text-[13px] font-bold">구분별 월 합계</div>
        {!hasType ? (
          <EmptyState title="이번 달 거래가 없습니다" />
        ) : (
          <ResponsiveContainer width="100%" height={170}>
            <BarChart data={typeData} margin={{ top: 4, right: 4, left: 4, bottom: 0 }}>
              <XAxis
                dataKey="name"
                tick={{ fontSize: 11, fill: '#736d65' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip formatter={tooltipWon} cursor={{ fill: '#efece6' }} />
              <Bar dataKey="value" radius={[5, 5, 0, 0]}>
                {typeData.map((d) => (
                  <Cell key={d.name} fill={d.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>

      <Card>
        <div className="mb-2 text-[13px] font-bold">월별 수지 추세</div>
        <ResponsiveContainer width="100%" height={170}>
          <LineChart data={trendData} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: '#a8a299' }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip formatter={tooltipWon} />
            <Line
              type="monotone"
              dataKey="balance"
              stroke={toneHex.ink}
              strokeWidth={2.2}
              dot={{ r: 2.5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </Card>
    </div>
  )
}
