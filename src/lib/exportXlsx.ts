import type { TxnExportRow } from '../domain/exportTransactions'
import { TXN_EXPORT_HEADERS } from '../domain/exportTransactions'

/** Build an .xlsx workbook and trigger a browser download. */
export async function downloadTxnExportXlsx(
  rows: readonly TxnExportRow[],
  filename: string,
): Promise<void> {
  const XLSX = await import('xlsx')
  const sheet = XLSX.utils.json_to_sheet([...rows], { header: [...TXN_EXPORT_HEADERS] })
  sheet['!cols'] = [{ wch: 12 }, { wch: 8 }, { wch: 14 }, { wch: 14 }, { wch: 24 }, { wch: 10 }]
  const workbook = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(workbook, sheet, '거래내역')
  XLSX.writeFile(workbook, filename)
}
