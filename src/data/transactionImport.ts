import {
  type CsvTransaction,
  existingImportWarnings,
  type ValidatedCsvImport,
} from '../domain/importTransactions'
import { supabase } from '../lib/supabase'
import { mapTransaction } from './mappers'

/** Read existing rows by small date groups; paginate to avoid PostgREST's row cap. */
export async function checkExistingImportTransactions(
  ledgerId: string,
  rows: readonly CsvTransaction[],
  signal: AbortSignal,
  onProgress: (pct: number) => void,
) {
  const dates = [...new Set(rows.map((row) => row.txnDate))]
  const warnings = []
  for (let i = 0; i < dates.length; i += 30) {
    const group = dates.slice(i, i + 30)
    const groupDates = new Set(group)
    const groupRows = rows.filter((row) => groupDates.has(row.txnDate))
    let cursor: string | null = null
    do {
      signal.throwIfAborted()
      let query = supabase
        .from('transactions')
        .select('*')
        .eq('ledger_id', ledgerId)
        .in('txn_date', group)
        .order('id', { ascending: true })
        .limit(500)
        .abortSignal(signal)
      if (cursor) query = query.gt('id', cursor)
      const { data, error } = await query
      if (error) throw error
      const existing = (data ?? []).map(mapTransaction)
      warnings.push(...existingImportWarnings(groupRows, existing))
      cursor = existing.length === 500 ? existing[existing.length - 1].id : null
    } while (cursor)
    onProgress(Math.round((Math.min(i + 30, dates.length) / dates.length) * 100))
  }
  // A CSV row matching several pages should only be warned about once.
  return [...new Map(warnings.map((warning) => [warning.line, warning])).values()]
}

/** One atomic, idempotent request; keep requestId unchanged after an uncertain response. */
export async function importTransactions(
  ledgerId: string,
  requestId: string,
  value: ValidatedCsvImport,
): Promise<number> {
  const { data, error } = await supabase.rpc('import_transactions', {
    p_ledger: ledgerId,
    p_request_id: requestId,
    p_rows: value.rows.map((row) => ({
      categoryId: row.categoryId,
      type: row.type,
      txnDate: row.txnDate,
      amount: row.amount,
      memo: row.memo,
    })),
  })
  if (error) throw error
  if (data !== value.rows.length)
    throw new Error(
      '저장 결과를 확인하지 못했습니다. 같은 화면에서 다시 확인하면 중복 없이 처리됩니다.',
    )
  return data
}
