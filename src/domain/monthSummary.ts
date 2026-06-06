import type { TxnLike } from './types'

export interface MonthSummary {
  totalIncome: number
  totalExpense: number
  totalSaving: number
  totalInvestment: number
  balance: number
}

/**
 * Sum a month's transactions per fund type and derive the 수지 (balance).
 *
 * Per spec §6.2 amounts are stored positive; the *meaning* of each type is
 * applied here: balance = 수입 − 지출 − 저축 − 투자. Recurring items are already
 * materialized into `transactions`, so they need no special handling.
 */
export function computeMonthSummary(txns: readonly TxnLike[]): MonthSummary {
  let totalIncome = 0
  let totalExpense = 0
  let totalSaving = 0
  let totalInvestment = 0

  for (const t of txns) {
    switch (t.type) {
      case 'income':
        totalIncome += t.amount
        break
      case 'expense':
        totalExpense += t.amount
        break
      case 'saving':
        totalSaving += t.amount
        break
      case 'investment':
        totalInvestment += t.amount
        break
    }
  }

  const balance = totalIncome - totalExpense - totalSaving - totalInvestment
  return { totalIncome, totalExpense, totalSaving, totalInvestment, balance }
}
