import { useState } from 'react'
import { Outlet } from 'react-router-dom'

import { AddTransactionSheet } from '../features/transactions/AddTransactionSheet'
import { AppShell, TabBar } from '../ui'
import { useRefresh } from './useRefresh'

// Authenticated shell: the page (via <Outlet/>) renders its own AppBar + body,
// the persistent bottom TabBar lives here, and the add-transaction sheet is
// global so the center + button works from every screen.
export function AppLayout() {
  const [addOpen, setAddOpen] = useState(false)
  const { refresh } = useRefresh()

  return (
    <AppShell>
      <Outlet />
      <TabBar onAdd={() => setAddOpen(true)} />
      {/* onSaved only refreshes data — the sheet closes itself unless 저장 후 계속. */}
      <AddTransactionSheet open={addOpen} onClose={() => setAddOpen(false)} onSaved={refresh} />
    </AppShell>
  )
}
