import type { ReactNode } from 'react'
import { useState } from 'react'

import { RefreshContext } from './refreshContext'

// App-wide mutation signal: bumping `version` lets any screen re-fetch after a
// write made elsewhere (e.g. the global add-transaction sheet). Screens include
// `version` in their fetch effect dependencies.
export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  return (
    <RefreshContext.Provider value={{ version, refresh: () => setVersion((v) => v + 1) }}>
      {children}
    </RefreshContext.Provider>
  )
}
