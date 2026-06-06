import { useRefresh } from '../../app/refresh'
import { useAsyncData } from '../../app/useAsyncData'
import { useLedger } from '../../auth/LedgerContext'
import { listCategories } from '../../data/categories'
import { BottomSheet } from '../../ui'
import { TransactionSheet } from './TransactionSheet'

interface AddTransactionSheetProps {
  open: boolean
  onClose: () => void
  onSaved?: () => void
}

/**
 * Global add-transaction entry point (the bottom-sheet behind the + tab button).
 * Loads the ledger's active categories and renders the shared form in create mode.
 */
export function AddTransactionSheet({ open, onClose, onSaved }: AddTransactionSheetProps) {
  const { ledgerId, canEdit } = useLedger()
  const { version } = useRefresh()
  const { data } = useAsyncData(
    () => (ledgerId ? listCategories(ledgerId, { activeOnly: true }) : Promise.resolve([])),
    [ledgerId, version],
  )

  if (!ledgerId || !canEdit) {
    return (
      <BottomSheet open={open} onClose={onClose} title="거래 추가">
        <p className="py-6 text-center text-sm text-ink3">거래를 추가할 권한이 없습니다.</p>
      </BottomSheet>
    )
  }

  return (
    <TransactionSheet
      open={open}
      onClose={onClose}
      ledgerId={ledgerId}
      transaction={null}
      categories={data ?? []}
      onSaved={() => onSaved?.()}
    />
  )
}
