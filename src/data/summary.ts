import type { Transaction } from '../domain/types'
import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'
import { supabase } from '../lib/supabase'
import { mapTransaction } from './mappers'

/**
 * Ensure the selected month's recurring occurrences exist as real transactions.
 * Idempotent; viewers are a no-op server-side (the RPC returns 0).
 */
export async function materializeMonth(ledgerId: string, ym: YearMonth): Promise<void> {
  const month = `${monthKey(ym.year, ym.month)}-01`
  const { error } = await supabase.rpc('materialize_recurring', {
    p_ledger: ledgerId,
    p_month: month,
  })
  if (error) throw error
}

/** Materialize several months in parallel (used by the dashboard trend + reports). */
export async function materializeMonths(ledgerId: string, months: YearMonth[]): Promise<void> {
  await Promise.all(months.map((m) => materializeMonth(ledgerId, m)))
}

/** All transactions within [start, endExclusive) — bounded by the queried period. */
export async function fetchTransactionsInRange(
  ledgerId: string,
  start: string,
  endExclusive: string,
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('ledger_id', ledgerId)
    .gte('txn_date', start)
    .lt('txn_date', endExclusive)
    .order('txn_date', { ascending: false })
  if (error) throw error
  return (data ?? []).map(mapTransaction)
}
