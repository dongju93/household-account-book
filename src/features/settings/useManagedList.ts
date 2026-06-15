import { useState } from 'react'

import { describeError } from '../../data/errors'

/** Shared sheet + mutation lifecycle for settings list managers. */
export function useManagedList(onRefresh: () => void) {
  const [sheetOpen, setSheetOpen] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)

  function openCreate() {
    setSheetOpen(true)
  }

  function closeSheet() {
    setSheetOpen(false)
  }

  function afterMutation(reload: () => void) {
    setSheetOpen(false)
    setActionError(null)
    reload()
    onRefresh()
  }

  async function run(action: () => Promise<void>, reload: () => void) {
    try {
      setActionError(null)
      await action()
      reload()
      onRefresh()
    } catch (err) {
      setActionError(describeError(err).message)
    }
  }

  return {
    sheetOpen,
    setSheetOpen,
    actionError,
    openCreate,
    closeSheet,
    afterMutation,
    run,
  }
}
