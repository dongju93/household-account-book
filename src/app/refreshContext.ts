import { createContext } from 'react'

export interface RefreshValue {
  version: number
  refresh: () => void
}

export const RefreshContext = createContext<RefreshValue>({ version: 0, refresh: () => {} })
