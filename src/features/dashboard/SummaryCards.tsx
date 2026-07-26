import { fundTypeLabel } from '../../domain/fundType'
import type { FundType } from '../../domain/fundType'
import type { MonthSummary } from '../../domain/monthSummary'
import { formatNumber } from '../../lib/format'
import { Card, Progress, Won } from '../../ui'
import { fundTone } from '../../ui/statusTone'

/**
 * 요약 화면의 주인공 (docs/5. frontend-redesign-plan.md §6.3, 1–2번).
 *
 * Two changes, no new numbers:
 *
 * 1. The balance becomes a genuine hero — an 18px `hero` surface carrying the
 *    only `text-hero` figure on the screen, so §6.3's "5초 안에 판단" has a single
 *    obvious entry point.
 * 2. The four fund totals stop being four identical bordered cards and become one
 *    surface split 2×2 by rules. §2.2 P0 was that everything sat on the same kind
 *    of white card, so nothing led; collapsing these into one surface drops the
 *    card count from five to two and puts the hero a clear level above.
 *
 * Colour follows §4.1's split: the balance sign is UI *state* (`Status *`),
 * while the four share bars are fund *data* (`Fund *`). They used to share one
 * scale, which is why 지출 and 위험 looked identical.
 */
export function SummaryCards({ summary }: { summary: MonthSummary }) {
  const { totalIncome, totalExpense, totalSaving, totalInvestment, balance } = summary
  const share = (amount: number) => (totalIncome > 0 ? Math.round((amount / totalIncome) * 100) : 0)
  const positive = balance >= 0

  return (
    <div className="flex flex-col gap-3">
      <Card level="hero" pad="px-4 py-5">
        <h2 className="text-caption font-semibold text-ink2">이번 달 남는 돈 (수지)</h2>
        <p
          className={`tnum text-hero mt-1.5 ${positive ? 'text-status-success' : 'text-status-danger'}`}
        >
          {positive ? '+' : '-'}₩{formatNumber(Math.abs(balance))}
        </p>
        <p className="text-caption mt-2 text-ink2">수입 − 지출 − 저축 − 투자</p>
      </Card>

      {/* One surface, four cells. Dividers instead of four card borders (§4.3:
          "한 섹션 안에서는 카드보다 구분선과 여백을 우선한다"). */}
      <Card pad="p-0">
        <h2 className="sr-only">자금 흐름</h2>
        <div className="grid grid-cols-2">
          <FlowCell type="income" amount={totalIncome} pct={100} />
          <FlowCell type="expense" amount={totalExpense} pct={share(totalExpense)} />
          <FlowCell type="saving" amount={totalSaving} pct={share(totalSaving)} />
          <FlowCell type="investment" amount={totalInvestment} pct={share(totalInvestment)} />
        </div>
      </Card>
    </div>
  )
}

function FlowCell({ type, amount, pct }: { type: FundType; amount: number; pct: number }) {
  return (
    <div className="flex flex-col gap-1.5 border-line-soft p-3 [&:nth-child(-n+2)]:border-b [&:nth-child(odd)]:border-r">
      <div className="flex items-center gap-1.5">
        {/* The dot repeats the chart colour so the strip and the charts below
            read as the same four series; the text label carries the meaning. */}
        <span aria-hidden className={`h-2 w-2 flex-none rounded-full ${dotClass(type)}`} />
        <span className="text-caption font-semibold text-ink2">{fundTypeLabel(type)}</span>
      </div>
      <Won value={amount} className="text-section text-ink" />
      <Progress pct={pct} tone={fundTone(type)} height={4} />
    </div>
  )
}

// Static class strings so Tailwind can see them at build time.
const DOT_CLASS: Record<FundType, string> = {
  income: 'bg-fund-income',
  expense: 'bg-fund-expense',
  saving: 'bg-fund-saving',
  investment: 'bg-fund-investment',
}

function dotClass(type: FundType): string {
  return DOT_CLASS[type]
}
