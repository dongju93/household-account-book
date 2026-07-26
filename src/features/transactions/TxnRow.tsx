import type { Transaction } from '../../domain/types'
import { Glyph, Won } from '../../ui'
import { type GlyphKey, glyphForCategory } from '../../ui/glyphForCategory'

/**
 * §6.4 keeps the four-level row hierarchy — category, memo, 고정 marker, amount —
 * and the rule that only 수입 is coloured. The colour itself moves from the
 * status scale to `Fund income`, since an income amount is fund data, not a
 * "success" state (§4.1).
 */
export function TxnRow({
  txn,
  categoryName,
  categoryIcon,
  onClick,
}: {
  txn: Transaction
  categoryName: string
  categoryIcon?: GlyphKey | null
  onClick?: () => void
}) {
  const isIncome = txn.type === 'income'
  // income reads as a positive inflow; the other three reduce the balance.
  const signedValue = isIncome ? txn.amount : -txn.amount

  return (
    <button
      type="button"
      onClick={onClick}
      className="pressable flex min-h-14 w-full items-center gap-3 border-b border-line-soft py-2.5 text-left last:border-b-0 hover:bg-fill1"
    >
      <span className="flex h-10 w-10 flex-none items-center justify-center rounded-surface border border-line bg-fill1 text-ink2">
        <Glyph name={categoryIcon ?? glyphForCategory(categoryName, txn.type)} size={19} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="text-section truncate text-ink">{categoryName}</span>
          {txn.source === 'recurring' && (
            <span className="text-micro flex-none rounded-control border border-line px-1.5 py-px text-ink2">
              고정
            </span>
          )}
        </span>
        {txn.memo && <span className="text-caption block truncate text-ink2">{txn.memo}</span>}
      </span>
      <Won
        value={signedValue}
        withSign={isIncome}
        className={`text-section flex-none ${isIncome ? 'text-fund-income' : 'text-ink'}`}
      />
    </button>
  )
}
