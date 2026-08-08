import type { FundType } from '../domain/fundType'
import type { Transaction, TxnSource } from '../domain/types'
import { addDaysISO } from '../lib/month'
import { supabase } from '../lib/supabase'
import { mapTransaction } from './mappers'

export const PAGE_SIZE = 30

export interface TxnCursor {
  date: string
  id: string
}

export interface TxnFilter {
  start: string // 'YYYY-MM-DD' inclusive
  endExclusive: string // 'YYYY-MM-DD' exclusive
  type?: FundType | null
  categoryId?: string | null
  search?: string | null
}

export interface TxnPage {
  rows: Transaction[]
  nextCursor: TxnCursor | null
}

/** One keyset page of transactions, newest first. */
export async function listTransactions(
  ledgerId: string,
  filter: TxnFilter,
  cursor?: TxnCursor | null,
): Promise<TxnPage> {
  let query = supabase
    .from('transactions')
    .select('*')
    .eq('ledger_id', ledgerId)
    .gte('txn_date', filter.start)
    .lt('txn_date', filter.endExclusive)

  if (filter.type) query = query.eq('type', filter.type)
  if (filter.categoryId) query = query.eq('category_id', filter.categoryId)
  if (filter.search?.trim()) query = query.ilike('memo', `%${filter.search.trim()}%`)

  if (cursor) {
    // strictly after the cursor in (txn_date desc, id desc) order
    query = query.or(
      `txn_date.lt.${cursor.date},and(txn_date.eq.${cursor.date},id.lt.${cursor.id})`,
    )
  }

  query = query
    .order('txn_date', { ascending: false })
    .order('id', { ascending: false })
    .limit(PAGE_SIZE + 1)

  const { data, error } = await query
  if (error) throw error

  const rows = (data ?? []).map(mapTransaction)
  let nextCursor: TxnCursor | null = null
  if (rows.length > PAGE_SIZE) {
    const last = rows[PAGE_SIZE - 1]
    nextCursor = { date: last.txnDate, id: last.id }
    rows.length = PAGE_SIZE
  }
  return { rows, nextCursor }
}

/** Fetch every row matching the filter by walking keyset pages. */
export async function listAllTransactions(
  ledgerId: string,
  filter: TxnFilter,
): Promise<Transaction[]> {
  const all: Transaction[] = []
  let cursor: TxnCursor | null = null
  do {
    const page = await listTransactions(ledgerId, filter, cursor)
    all.push(...page.rows)
    cursor = page.nextCursor
  } while (cursor)
  return all
}

export interface MemoHistoryItem {
  categoryId: string
  memo: string | null
}

/**
 * Fetch recent transactions whose memo matches the draft in EITHER substring
 * direction — "stored contains new" (`스타벅스 강남점` ⊃ `스타벅스`) or "new
 * contains stored" (`스타벅스` ⊂ `스타벅스 강남점`). The domain matcher
 * `suggestCategoriesFromMemo` already handles either-side matches; this query
 * must surface rows for both so the matcher actually sees them.
 *
 * The reverse direction ("new contains stored") cannot be expressed through
 * PostgREST — `ilike`/`imatch` always place the column on the left, so the
 * stored value can never be the haystack for the draft as pattern — so the
 * matching runs in the `search_memo_history` RPC (migration 0014), which uses
 * case-insensitive `strpos` on the lowercased pair for both directions (plain
 * substring, never a regex with the column as pattern, so stored memo
 * metacharacters stay literal). Read-only: returns rows; never gates a write.
 */
export async function fetchMemoHistory(
  ledgerId: string,
  memo: string,
  limit = 50,
): Promise<MemoHistoryItem[]> {
  const trimmed = memo.trim()
  if (!trimmed || !ledgerId) return []

  const { data, error } = await supabase.rpc('search_memo_history', {
    p_ledger: ledgerId,
    p_memo: trimmed,
    p_limit: limit,
  })

  if (error) throw error
  return ((data ?? []) as Array<{ category_id: string; memo: string | null }>).map((row) => ({
    categoryId: row.category_id,
    memo: row.memo,
  }))
}

/**
 * Rows that could be near-duplicates of a draft (§5.14 pre-save guard).
 *
 * Narrowed server-side on exactly the fields `isNearDuplicate` requires to match
 * exactly — type, amount, category — plus the ±1-day window. The fuzzy part
 * (memo similarity) stays in the domain layer, so the rule lives in one place and
 * this query stays index-friendly (`transactions_ledger_type_date_idx`).
 * Read-only; it exists so the guard can warn, never to gate a write server-side.
 */
export async function fetchNearDuplicateCandidates(
  ledgerId: string,
  draft: { txnDate: string; type: FundType; amount: number; categoryId: string },
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('ledger_id', ledgerId)
    .eq('type', draft.type)
    .eq('amount', draft.amount)
    .eq('category_id', draft.categoryId)
    .gte('txn_date', addDaysISO(draft.txnDate, -1))
    .lte('txn_date', addDaysISO(draft.txnDate, 1))
    .order('txn_date', { ascending: true })
    .order('id', { ascending: true })

  if (error) throw error
  return (data ?? []).map(mapTransaction)
}

export interface TxnWrite {
  categoryId: string
  type: FundType
  txnDate: string
  amount: number
  memo: string | null
}

export async function createTransaction(ledgerId: string, input: TxnWrite): Promise<Transaction> {
  const { data, error } = await supabase
    .from('transactions')
    .insert({
      ledger_id: ledgerId,
      category_id: input.categoryId,
      type: input.type,
      txn_date: input.txnDate,
      amount: input.amount,
      memo: input.memo,
      source: 'manual',
    })
    .select('*')
    .single()
  if (error) throw error
  return mapTransaction(data)
}

export async function updateTransaction(id: string, input: TxnWrite): Promise<void> {
  const { error } = await supabase
    .from('transactions')
    .update({
      category_id: input.categoryId,
      type: input.type,
      txn_date: input.txnDate,
      amount: input.amount,
      memo: input.memo,
    })
    .eq('id', id)
  if (error) throw error
}

export interface DeletableTxn {
  id: string
  ledgerId: string
  source: TxnSource
  recurringId: string | null
  occurrenceMonth: string | null
}

/**
 * Delete a transaction. For a recurring-sourced occurrence, first record a skip
 * so re-opening the month does not resurrect it (documented delete policy).
 */
export async function deleteTransaction(txn: DeletableTxn): Promise<void> {
  if (txn.source === 'recurring' && txn.recurringId && txn.occurrenceMonth) {
    const { error: skipError } = await supabase.from('recurring_skips').insert({
      recurring_id: txn.recurringId,
      occurrence_month: txn.occurrenceMonth,
      ledger_id: txn.ledgerId,
    })
    // 23505 = the skip already exists; that is fine.
    if (skipError && (skipError as { code?: string }).code !== '23505') throw skipError
  }

  const { error } = await supabase.from('transactions').delete().eq('id', txn.id)
  if (error) throw error
}
