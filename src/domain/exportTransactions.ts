import type { YearMonth } from '../lib/month'
import { monthKey } from '../lib/month'
import { fundTypeLabel } from './fundType'
import type { Transaction, TxnSource } from './types'

const SOURCE_LABELS: Record<TxnSource, string> = {
  manual: '직접입력',
  recurring: '고정항목',
}

/** One row in the exported spreadsheet (Korean column keys). */
export interface TxnExportRow {
  날짜: string
  구분: string
  카테고리: string
  '금액(원)': number
  메모: string
  출처: string
}

export const TXN_EXPORT_HEADERS: (keyof TxnExportRow)[] = [
  '날짜',
  '구분',
  '카테고리',
  '금액(원)',
  '메모',
  '출처',
]

/** Map transactions to export rows, newest first (input order preserved). */
export function buildTxnExportRows(
  transactions: readonly Transaction[],
  categoryNameById: ReadonlyMap<string, string>,
): TxnExportRow[] {
  return transactions.map((t) => ({
    날짜: t.txnDate,
    구분: fundTypeLabel(t.type),
    카테고리: categoryNameById.get(t.categoryId) ?? '카테고리',
    '금액(원)': t.amount,
    메모: t.memo ?? '',
    출처: SOURCE_LABELS[t.source],
  }))
}

/** Default download name for a month's export. */
export function txnExportFilename(ym: YearMonth): string {
  return `거래내역_${monthKey(ym.year, ym.month)}.xlsx`
}
