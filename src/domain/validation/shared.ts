import type { FundType } from '../fundType'

/** Transaction/recurring type must equal its category's type (spec §2.5 / §2.4). */
export function typeMatches(txnType: FundType, categoryType: FundType): boolean {
  return txnType === categoryType
}

export function isProvided(v: unknown): boolean {
  return v != null && v !== ''
}

export function toInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(n) ? n : null
}
