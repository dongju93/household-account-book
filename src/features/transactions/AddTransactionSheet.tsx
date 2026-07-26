import { useAsyncData } from '../../app/useAsyncData'
import { useRefresh } from '../../app/useRefresh'
import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { BottomSheet, EmptyState } from '../../ui'
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
        <EmptyState
          title="거래를 추가할 권한이 없습니다"
          description="이 가계부에서는 읽기만 할 수 있습니다."
        />
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
