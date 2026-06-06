import { createContext } from 'react'
import type { MemberRole } from '../domain/types'

export type LedgerStatus = 'loading' | 'ready' | 'error' | 'none'

export interface LedgerValue {
  status: LedgerStatus
  ledgerId: string | null
  ledgerName: string | null
  role: MemberRole | null
  canEdit: boolean // editor or owner — may write transactions/recurring
  canManage: boolean // owner — may manage categories/settings/members
  reload: () => void
}

export const LedgerContext = createContext<LedgerValue | null>(null)
