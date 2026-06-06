import type { Category, RecurringItem, Transaction } from '../domain/types'

// DB rows come back snake_case; map them to the camelCase domain types once here.

// biome-ignore lint/suspicious/noExplicitAny: PostgREST rows are loosely typed
type Row = Record<string, any>

export function mapCategory(r: Row): Category {
  return {
    id: r.id,
    ledgerId: r.ledger_id,
    name: r.name,
    type: r.type,
    budgetAmount: r.budget_amount,
    goalAmount: r.goal_amount,
    sortOrder: r.sort_order,
    isActive: r.is_active,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function mapRecurring(r: Row): RecurringItem {
  return {
    id: r.id,
    ledgerId: r.ledger_id,
    categoryId: r.category_id,
    name: r.name,
    type: r.type,
    amount: Number(r.amount),
    startMonth: r.start_month,
    endMonth: r.end_month,
    dayOfMonth: r.day_of_month,
    isActive: r.is_active,
    memo: r.memo,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}

export function mapTransaction(r: Row): Transaction {
  return {
    id: r.id,
    ledgerId: r.ledger_id,
    categoryId: r.category_id,
    txnDate: r.txn_date,
    type: r.type,
    amount: Number(r.amount),
    memo: r.memo,
    source: r.source,
    recurringId: r.recurring_id,
    occurrenceMonth: r.occurrence_month,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }
}
