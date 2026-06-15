import type { FundType } from '../fundType'
import type { CategoryLike } from '../types'
import { normalizeAmount } from './amount'
import { typeMatches } from './shared'
import type { ValidationResult } from './types'

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
