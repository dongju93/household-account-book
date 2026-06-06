import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { supabase } from '../lib/supabase'
import type { MemberRole } from '../domain/types'
import { useAuth } from './AuthContext'

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

const LedgerContext = createContext<LedgerValue | null>(null)

interface MembershipRow {
  ledger_id: string
  role: MemberRole
  // PostgREST returns an object for the to-one relation, but supabase-js types it
  // loosely; accept either shape.
  ledgers: { name: string } | { name: string }[] | null
}

function resolveLedgerName(row: MembershipRow): string {
  const l = row.ledgers
  if (Array.isArray(l)) return l[0]?.name ?? '내 가계부'
  return l?.name ?? '내 가계부'
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth()
  const [status, setStatus] = useState<LedgerStatus>('loading')
  const [ledgerId, setLedgerId] = useState<string | null>(null)
  const [ledgerName, setLedgerName] = useState<string | null>(null)
  const [role, setRole] = useState<MemberRole | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  useEffect(() => {
    // Clear all ledger state whenever the user is not authenticated so signing
    // out cannot leave protected data behind.
    if (authStatus !== 'authed' || !user) {
      setStatus(authStatus === 'loading' ? 'loading' : 'none')
      setLedgerId(null)
      setLedgerName(null)
      setRole(null)
      return
    }

    let active = true
    setStatus('loading')
    supabase
      .from('ledger_members')
      .select('ledger_id, role, ledgers(name)')
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setStatus('error')
          return
        }
        const row = (data as unknown as MembershipRow[] | null)?.[0]
        if (!row) {
          setStatus('none')
          return
        }
        setLedgerId(row.ledger_id)
        setRole(row.role)
        setLedgerName(resolveLedgerName(row))
        setStatus('ready')
      })

    return () => {
      active = false
    }
  }, [authStatus, user, reloadKey])

  const value: LedgerValue = {
    status,
    ledgerId,
    ledgerName,
    role,
    canEdit: role === 'owner' || role === 'editor',
    canManage: role === 'owner',
    reload: () => setReloadKey((k) => k + 1),
  }

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}

export function useLedger(): LedgerValue {
  const ctx = useContext(LedgerContext)
  if (!ctx) throw new Error('useLedger must be used within <LedgerProvider>')
  return ctx
}
