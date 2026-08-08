import type { Transaction } from '../domain/types'
import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'
import { supabase } from '../lib/supabase'
import { mapTransaction } from './mappers'

/**
 * Ensure the selected month's recurring occurrences exist as real transactions.
 * Idempotent; viewers are a no-op server-side (the RPC returns 0). Callers that
 * need a complete month for review/AI must fail closed for viewers when
 * occurrences are still missing — see `MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON`.
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

/**
 * Page size for {@link fetchTransactionsInRange}'s internal keyset loop. Must
 * stay below the PostgREST `max_rows` cap (supabase/config.toml: `api.max_rows`
 * = 1000) so the `+1` overflow sentinel below is never clipped by the server;
 * a clipped sentinel would make a full page look like the last page and
 * silently drop every older row — the exact bug this loop exists to prevent.
 */
export const RANGE_PAGE_SIZE = 500

/**
 * All transactions within [start, endExclusive) — bounded by the queried period.
 *
 * Drains keyset pages on `(txn_date desc, id desc)` instead of issuing a single
 * unbounded query. A single query is silently capped at the PostgREST `max_rows`
 * limit, so a ledger with more rows than that (e.g. the settings page's
 * six-month recommendation history) used to receive only the newest rows and
 * drop older completed months — under-counting recurring patterns and budget
 * medians. The keyset cursor mirrors {@link listTransactions} and is served by
 * the `transactions_ledger_date_idx` index.
 */
export async function fetchTransactionsInRange(
  ledgerId: string,
  start: string,
  endExclusive: string,
): Promise<Transaction[]> {
  const all: Transaction[] = []
  let cursor: { date: string; id: string } | null = null
  for (;;) {
    let query = supabase
      .from('transactions')
      .select('*')
      .eq('ledger_id', ledgerId)
      .gte('txn_date', start)
      .lt('txn_date', endExclusive)
    if (cursor) {
      // strictly after the cursor in (txn_date desc, id desc) order
      query = query.or(
        `txn_date.lt.${cursor.date},and(txn_date.eq.${cursor.date},id.lt.${cursor.id})`,
      )
    }
    const { data, error } = await query
      .order('txn_date', { ascending: false })
      .order('id', { ascending: false })
      .limit(RANGE_PAGE_SIZE + 1)
    if (error) throw error
    const rows = (data ?? []).map(mapTransaction)
    if (rows.length <= RANGE_PAGE_SIZE) {
      all.push(...rows)
      return all
    }
    all.push(...rows.slice(0, RANGE_PAGE_SIZE))
    const last = rows[RANGE_PAGE_SIZE - 1]
    cursor = { date: last.txnDate, id: last.id }
  }
}
