import type { MonthSummary } from '../../domain/monthSummary'
import { Won } from '../../ui'
import { Progress } from '../../ui/primitives'
import type { Tone } from '../../ui/tone'

export function SummaryCards({ summary }: { summary: MonthSummary }) {
  const { totalIncome, totalExpense, totalSaving, totalInvestment, balance } = summary
  const share = (amount: number) => (totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0)

  return (
    <div className="flex flex-col gap-3">
      <div className="rounded-[16px] border border-line bg-paper px-4 py-4">
        <div className="text-xs font-semibold text-ink2">이번 달 남는 돈 (수지)</div>
        <div
          className={`tnum mt-1 text-[30px] font-extrabold ${balance >= 0 ? 'text-ok' : 'text-danger'}`}
        >
          {balance >= 0 ? '+' : '-'}₩{new Intl.NumberFormat('ko-KR').format(Math.abs(balance))}
        </div>
        <div className="mt-1 text-[11px] text-ink3">수입 − 지출 − 저축 − 투자</div>
      </div>

      <div className="grid grid-cols-2 gap-2.5">
        <StatCell label="수입" amount={totalIncome} pct={100} tone="neutral" />
        <StatCell label="지출" amount={totalExpense} pct={share(totalExpense)} tone="danger" />
        <StatCell label="저축" amount={totalSaving} pct={share(totalSaving)} tone="ok" />
        <StatCell label="투자" amount={totalInvestment} pct={share(totalInvestment)} tone="info" />
      </div>
    </div>
  )
}

function StatCell({
  label,
  amount,
  pct,
  tone,
}: {
  label: string
  amount: number
  pct: number
  tone: Tone
}) {
  return (
    <div className="rounded-[12px] border border-line bg-paper px-3 py-2.5">
      <div className="mb-1 text-[11.5px] font-semibold text-ink2">{label}</div>
      <Won value={amount} className="text-[15px] font-bold text-ink" />
      <div className="mt-1.5">
        <Progress pct={pct} tone={tone} height={5} />
      </div>
    </div>
  )
}
