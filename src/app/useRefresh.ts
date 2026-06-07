import { useContext } from 'react'

import { RefreshContext, type RefreshValue } from './refreshContext'

export function useRefresh(): RefreshValue {
  return useContext(RefreshContext)
}
