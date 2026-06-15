import type { Transaction } from './types'

export interface DateGroup {
  date: string
  rows: Transaction[]
  net: number
}

/** Group transactions by txnDate (preserving list order) with per-day net. */
export function groupTransactionsByDate(rows: Transaction[]): DateGroup[] {
  const groups: DateGroup[] = []
  let current: DateGroup | null = null
  for (const r of rows) {
    if (!current || current.date !== r.txnDate) {
      current = { date: r.txnDate, rows: [], net: 0 }
      groups.push(current)
    }
    current.rows.push(r)
    current.net += r.type === 'income' ? r.amount : -r.amount
  }
  return groups
}
