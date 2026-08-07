import type { FundType } from '../domain/fundType'
import type { Transaction, TxnSource } from '../domain/types'
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
  type: FundType
  memo: string | null
  txnDate: string
}

/** Fetch recent transactions with memo matching search string for rule-based category suggestions. */
export async function fetchMemoHistory(
  ledgerId: string,
  memo: string,
  limit = 50,
): Promise<MemoHistoryItem[]> {
  const trimmed = memo.trim()
  if (!trimmed || !ledgerId) return []

  const { data, error } = await supabase
    .from('transactions')
    .select('category_id, type, memo, txn_date')
    .eq('ledger_id', ledgerId)
    .not('memo', 'is', null)
    .ilike('memo', `%${trimmed}%`)
    .order('txn_date', { ascending: false })
    .limit(limit)

  if (error) throw error
  return (data ?? []).map((row) => ({
    categoryId: row.category_id,
    type: row.type as FundType,
    memo: row.memo,
    txnDate: row.txn_date,
  }))
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
