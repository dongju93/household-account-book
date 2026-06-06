import type { FundType } from './fundType'

export type MemberRole = 'owner' | 'editor' | 'viewer'
export type TxnSource = 'manual' | 'recurring'

// Status vocabularies are Korean labels because they are shown verbatim in the UI
// and map directly to the wireframe's statusMeta tones.
export type ExpenseStatus = '초과' | '주의' | '정상'
export type SavingStatus = '달성' | '근접' | '진행중'
export type AchievementStatus = ExpenseStatus | SavingStatus

// ── Persisted entities (camelCase mirrors the DB rows after mapping) ──────────
export interface Ledger {
  id: string
  name: string
  ownerId: string
  currency: string
  createdAt: string
  updatedAt: string
}

export interface Category {
  id: string
  ledgerId: string
  name: string
  type: FundType
  budgetAmount: number | null
  goalAmount: number | null
  sortOrder: number
  isActive: boolean
  createdAt: string
  updatedAt: string
}

export interface RecurringItem {
  id: string
  ledgerId: string
  categoryId: string
  name: string
  type: FundType
  amount: number
  startMonth: string // 'YYYY-MM-01'
  endMonth: string | null // 'YYYY-MM-01' | null (forever)
  dayOfMonth: number
  isActive: boolean
  memo: string | null
  createdAt: string
  updatedAt: string
}

export interface Transaction {
  id: string
  ledgerId: string
  categoryId: string
  txnDate: string // 'YYYY-MM-DD'
  type: FundType
  amount: number
  memo: string | null
  source: TxnSource
  recurringId: string | null
  occurrenceMonth: string | null // 'YYYY-MM-01' for recurring-sourced rows
  createdAt: string
  updatedAt: string
}

// ── Lightweight shapes for the pure calc layer (tests construct these directly) ─
export interface TxnLike {
  type: FundType
  amount: number
  categoryId: string
}

export interface CategoryLike {
  id: string
  name: string
  type: FundType
  budgetAmount: number | null
  goalAmount: number | null
}
