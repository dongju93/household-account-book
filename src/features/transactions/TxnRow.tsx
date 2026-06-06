import type { Transaction } from '../../domain/types'
import { Glyph, Won } from '../../ui'
import { glyphForCategory } from '../../ui/Glyph'

export function TxnRow({
  txn,
  categoryName,
  onClick,
}: {
  txn: Transaction
  categoryName: string
  onClick?: () => void
}) {
  const isIncome = txn.type === 'income'
  // income reads as a positive inflow; the other three reduce the balance.
  const signedValue = isIncome ? txn.amount : -txn.amount

  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 border-b border-line-soft py-2.5 text-left last:border-b-0"
    >
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[11px] border border-line bg-fill1 text-ink2">
        <Glyph name={glyphForCategory(categoryName, txn.type)} size={18} />
      </span>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-[13.5px] font-bold">{categoryName}</span>
          {txn.source === 'recurring' && (
            <span className="flex-none rounded-[5px] border border-line px-1 py-px text-[9.5px] font-bold text-ink3">
              고정
            </span>
          )}
        </div>
        {txn.memo && <div className="truncate text-[11px] text-ink3">{txn.memo}</div>}
      </div>
      <Won
        value={signedValue}
        withSign={isIncome}
        className={'text-sm font-bold ' + (isIncome ? 'text-ok' : 'text-ink')}
      />
    </button>
  )
}
