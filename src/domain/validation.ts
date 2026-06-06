import type { FundType } from './fundType'
import { hasBudget, hasGoal } from './fundType'
import type { CategoryLike } from './types'

export type ValidationResult<T> =
  | { ok: true; value: T }
  | { ok: false; errors: Record<string, string> }

/** Transaction/recurring amount: strip grouping, truncate to integer, must be > 0. */
export function normalizeAmount(raw: unknown): number | null {
  return normalizeInteger(raw, { min: 1 })
}

/** Budget/goal amount: same normalization but 0 is allowed (unset/no target). */
export function normalizeNonNegative(raw: unknown): number | null {
  return normalizeInteger(raw, { min: 0 })
}

function normalizeInteger(raw: unknown, opts: { min: number }): number | null {
  let n: number
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    n = Math.trunc(raw)
  } else if (typeof raw === 'string') {
    const cleaned = raw.replace(/[,\s₩]/g, '')
    if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null
    n = Math.trunc(Number(cleaned))
  } else {
    return null
  }
  if (!Number.isFinite(n) || n < opts.min) return null
  return n
}

/** Transaction/recurring type must equal its category's type (spec §2.5 / §2.4). */
export function typeMatches(txnType: FundType, categoryType: FundType): boolean {
  return txnType === categoryType
}

// ── Transaction input ─────────────────────────────────────────────────────────
export interface TxnInput {
  amount: unknown
  date: string
  categoryId: string | null
  type: FundType
  memo?: string
}

export interface TxnValue {
  amount: number
  date: string
  categoryId: string
  type: FundType
  memo: string | null
}

export function validateTransactionInput(
  input: TxnInput,
  category: CategoryLike | null,
): ValidationResult<TxnValue> {
  const errors: Record<string, string> = {}

  const amount = normalizeAmount(input.amount)
  if (amount === null) errors.amount = '금액은 0보다 큰 정수여야 합니다.'

  if (!input.date) errors.date = '날짜를 선택하세요.'
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) errors.date = '날짜 형식이 올바르지 않습니다.'

  if (!input.categoryId) errors.categoryId = '카테고리를 선택하세요.'
  else if (category && !typeMatches(input.type, category.type)) {
    errors.categoryId = '카테고리 구분이 거래 구분과 일치하지 않습니다.'
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      amount: amount as number,
      date: input.date,
      categoryId: input.categoryId as string,
      type: input.type,
      memo: input.memo?.trim() ? input.memo.trim() : null,
    },
  }
}

// ── Category input ──────────────────────────────────────────────────────────
export interface CategoryInput {
  name: string
  type: FundType
  budgetAmount?: unknown
  goalAmount?: unknown
}

export interface CategoryValue {
  name: string
  type: FundType
  budgetAmount: number | null
  goalAmount: number | null
}

export function validateCategoryInput(input: CategoryInput): ValidationResult<CategoryValue> {
  const errors: Record<string, string> = {}
  const name = input.name?.trim() ?? ''
  if (!name) errors.name = '이름을 입력하세요.'

  let budgetAmount: number | null = null
  let goalAmount: number | null = null

  if (isProvided(input.budgetAmount)) {
    if (!hasBudget(input.type)) {
      errors.budgetAmount = '예산은 지출 카테고리만 설정할 수 있습니다.'
    } else {
      const b = normalizeNonNegative(input.budgetAmount)
      if (b === null) errors.budgetAmount = '예산은 0 이상의 정수여야 합니다.'
      else budgetAmount = b
    }
  }

  if (isProvided(input.goalAmount)) {
    if (!hasGoal(input.type)) {
      errors.goalAmount = '목표는 저축 카테고리만 설정할 수 있습니다.'
    } else {
      const g = normalizeNonNegative(input.goalAmount)
      if (g === null) errors.goalAmount = '목표는 0 이상의 정수여야 합니다.'
      else goalAmount = g
    }
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return { ok: true, value: { name, type: input.type, budgetAmount, goalAmount } }
}

// ── Recurring item input ────────────────────────────────────────────────────
export interface RecurringInput {
  name: string
  type: FundType
  categoryId: string | null
  amount: unknown
  startMonth: string // 'YYYY-MM'
  endMonth?: string | null // 'YYYY-MM' | null
  dayOfMonth: unknown
  memo?: string
}

export interface RecurringValue {
  name: string
  type: FundType
  categoryId: string
  amount: number
  startMonth: string
  endMonth: string | null
  dayOfMonth: number
  memo: string | null
}

export function validateRecurringInput(
  input: RecurringInput,
  category: CategoryLike | null,
): ValidationResult<RecurringValue> {
  const errors: Record<string, string> = {}

  const name = input.name?.trim() ?? ''
  if (!name) errors.name = '항목명을 입력하세요.'

  const amount = normalizeAmount(input.amount)
  if (amount === null) errors.amount = '금액은 0보다 큰 정수여야 합니다.'

  if (!input.categoryId) errors.categoryId = '카테고리를 선택하세요.'
  else if (category && !typeMatches(input.type, category.type)) {
    errors.categoryId = '카테고리 구분이 항목 구분과 일치하지 않습니다.'
  }

  if (!/^\d{4}-\d{2}$/.test(input.startMonth)) errors.startMonth = '시작월을 선택하세요.'

  let endMonth: string | null = null
  if (input.endMonth) {
    if (!/^\d{4}-\d{2}$/.test(input.endMonth)) {
      errors.endMonth = '종료월 형식이 올바르지 않습니다.'
    } else if (
      /^\d{4}-\d{2}$/.test(input.startMonth) &&
      input.endMonth < input.startMonth // lexicographic compare is valid for YYYY-MM
    ) {
      errors.endMonth = '종료월은 시작월보다 빠를 수 없습니다.'
    } else {
      endMonth = input.endMonth
    }
  }

  const day = toInt(input.dayOfMonth)
  if (day === null || day < 1 || day > 31) errors.dayOfMonth = '발생일은 1~31 사이여야 합니다.'

  if (Object.keys(errors).length > 0) return { ok: false, errors }
  return {
    ok: true,
    value: {
      name,
      type: input.type,
      categoryId: input.categoryId as string,
      amount: amount as number,
      startMonth: input.startMonth,
      endMonth,
      dayOfMonth: day as number,
      memo: input.memo?.trim() ? input.memo.trim() : null,
    },
  }
}

function isProvided(v: unknown): boolean {
  return v != null && v !== ''
}

function toInt(raw: unknown): number | null {
  const n = typeof raw === 'number' ? raw : Number(raw)
  return Number.isInteger(n) ? n : null
}
