import { useContext } from 'react'
import { LedgerContext, type LedgerValue } from './ledgerContext'

export function useLedger(): LedgerValue {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used within <LedgerProvider>')
  return ctx
}
