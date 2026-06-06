import { createContext, useContext, useState } from 'react'
import type { ReactNode } from 'react'

// App-wide mutation signal: bumping `version` lets any screen re-fetch after a
// write made elsewhere (e.g. the global add-transaction sheet). Screens include
// `version` in their fetch effect dependencies.
interface RefreshValue {
  version: number
  refresh: () => void
}

const RefreshContext = createContext<RefreshValue>({ version: 0, refresh: () => {} })

export function RefreshProvider({ children }: { children: ReactNode }) {
  const [version, setVersion] = useState(0)
  return (
    <RefreshContext.Provider value={{ version, refresh: () => setVersion((v) => v + 1) }}>
      {children}
    </RefreshContext.Provider>
  )
}

export function useRefresh(): RefreshValue {
  return useContext(RefreshContext)
}
