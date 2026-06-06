import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import type { MemberRole } from '../domain/types'
import { supabase } from '../lib/supabase'
import { LedgerContext, type LedgerStatus, type LedgerValue } from './ledgerContext'
import { useAuth } from './useAuth'

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

interface LedgerData {
  status: LedgerStatus
  ledgerId: string | null
  ledgerName: string | null
  role: MemberRole | null
}

const EMPTY_LEDGER: LedgerData = {
  status: 'loading',
  ledgerId: null,
  ledgerName: null,
  role: null,
}

export function LedgerProvider({ children }: { children: ReactNode }) {
  const { status: authStatus, user } = useAuth()
  const isAuthed = authStatus === 'authed' && !!user
  const [reloadKey, setReloadKey] = useState(0)

  const fetchKey = isAuthed ? `${user.id}:${reloadKey}` : null
  const [syncedKey, setSyncedKey] = useState(fetchKey)
  const [ledgerData, setLedgerData] = useState<LedgerData>(EMPTY_LEDGER)
  const [fetchedKey, setFetchedKey] = useState<string | null>(null)

  if (syncedKey !== fetchKey) {
    setSyncedKey(fetchKey)
    if (fetchKey !== null) {
      setLedgerData(EMPTY_LEDGER)
      setFetchedKey(null)
    }
  }

  useEffect(() => {
    if (!isAuthed || syncedKey === null) return

    let active = true
    supabase
      .from('ledger_members')
      .select('ledger_id, role, ledgers(name)')
      .order('created_at', { ascending: true })
      .limit(1)
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setLedgerData((prev) => ({ ...prev, status: 'error' }))
          setFetchedKey(syncedKey)
          return
        }
        const row = (data as unknown as MembershipRow[] | null)?.[0]
        if (!row) {
          setLedgerData({ status: 'none', ledgerId: null, ledgerName: null, role: null })
          setFetchedKey(syncedKey)
          return
        }
        setLedgerData({
          status: 'ready',
          ledgerId: row.ledger_id,
          role: row.role,
          ledgerName: resolveLedgerName(row),
        })
        setFetchedKey(syncedKey)
      })

    return () => {
      active = false
    }
  }, [isAuthed, syncedKey])

  const authedStatus: LedgerStatus = fetchedKey !== syncedKey ? 'loading' : ledgerData.status

  const value: LedgerValue = isAuthed
    ? {
        ...ledgerData,
        status: authedStatus,
        canEdit: ledgerData.role === 'owner' || ledgerData.role === 'editor',
        canManage: ledgerData.role === 'owner',
        reload: () => setReloadKey((k) => k + 1),
      }
    : {
        status: authStatus === 'loading' ? 'loading' : 'none',
        ledgerId: null,
        ledgerName: null,
        role: null,
        canEdit: false,
        canManage: false,
        reload: () => setReloadKey((k) => k + 1),
      }

  return <LedgerContext.Provider value={value}>{children}</LedgerContext.Provider>
}
