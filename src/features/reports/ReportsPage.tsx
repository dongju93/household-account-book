import { useState } from 'react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { useRefresh } from '../../app/refresh'
import { useAsyncData } from '../../app/useAsyncData'
import { useLedger } from '../../auth/LedgerContext'
import { categoryExpenseBreakdown, monthlyTrend } from '../../domain/reports'
import type { Transaction } from '../../domain/types'
import { listCategories } from '../../data/categories'
import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import { won } from '../../lib/format'
import { addMonths, currentYearMonth, monthKey, monthRange } from '../../lib/month'
import { AppBar, Card, Chip, EmptyState, ErrorBanner, LoadingState, ScreenBody } from '../../ui'
import { toneHex } from '../../ui/tone'

type RechartsValue = string | number | ReadonlyArray<string | number>
const fmtWon = (v: RechartsValue | undefined): string =>
  won(Number(Array.isArray(v) ? (v[0] ?? 0) : (v ?? 0)))
const DONUT_COLORS = ['#736d65', '#b07360', '#b09863', '#7d9377', '#7c87a2', '#a8a299', '#d6d0c7']

const PERIODS = [3, 6, 12] as const

export function ReportsPage() {
  const { ledgerId } = useLedger()
  const { version } = useRefresh()
  const [period, setPeriod] = useState<(typeof PERIODS)[number]>(6)

  // months ending at the current calendar month
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

  const trendData = trend.map((t) => ({
    label: `${Number(t.month.slice(5, 7))}월`,
    수입: t.totalIncome,
    지출: t.totalExpense,
    저축: t.totalSaving,
    투자: t.totalInvestment,
    수지: t.balance,
  }))

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
        {error && <ErrorBanner message={error.message} variant={error.permission ? 'permission' : 'error'} />}

        {!loading && !error && (
          <>
            <Card>
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[13px] font-bold">월별 추세</span>
                <Legend />
              </div>
              <ResponsiveContainer width="100%" height={190}>
                <LineChart data={trendData} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e9e5de" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a299' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={fmtWon} />
                  <Line type="monotone" dataKey="수입" stroke={toneHex.neutral} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="지출" stroke={toneHex.danger} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="저축" stroke={toneHex.ok} strokeWidth={2} dot={false} />
                  <Line type="monotone" dataKey="투자" stroke={toneHex.info} strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <div className="mb-2 text-[13px] font-bold">월별 수지 추세</div>
              <ResponsiveContainer width="100%" height={170}>
                <LineChart data={trendData} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                  <CartesianGrid stroke="#e9e5de" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 10, fill: '#a8a299' }} axisLine={false} tickLine={false} />
                  <Tooltip formatter={fmtWon} />
                  <Line type="monotone" dataKey="수지" stroke={toneHex.ink} strokeWidth={2.4} dot={{ r: 2.5 }} />
                </LineChart>
              </ResponsiveContainer>
            </Card>

            <Card>
              <div className="mb-2 text-[13px] font-bold">카테고리별 지출 비교</div>
              {breakdown.length === 0 ? (
                <EmptyState title="이 기간의 지출이 없습니다" />
              ) : (
                <ResponsiveContainer width="100%" height={Math.max(120, breakdown.length * 34)}>
                  <BarChart
                    data={breakdown}
                    layout="vertical"
                    margin={{ top: 0, right: 12, left: 8, bottom: 0 }}
                  >
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={64}
                      tick={{ fontSize: 11, fill: '#736d65' }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <Tooltip formatter={fmtWon} cursor={{ fill: '#efece6' }} />
                    <Bar dataKey="amount" radius={[0, 5, 5, 0]}>
                      {breakdown.map((row, i) => (
                        <Cell key={row.categoryId} fill={DONUT_COLORS[i % DONUT_COLORS.length]} />
                      ))}
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

function Legend() {
  const items: Array<[string, string]> = [
    ['수입', toneHex.neutral],
    ['지출', toneHex.danger],
    ['저축', toneHex.ok],
    ['투자', toneHex.info],
  ]
  return (
    <span className="flex gap-2">
      {items.map(([label, color]) => (
        <span key={label} className="flex items-center gap-1 text-[10px] text-ink2">
          <span className="h-[3px] w-2.5 rounded" style={{ background: color }} />
          {label}
        </span>
      ))}
    </span>
  )
}
