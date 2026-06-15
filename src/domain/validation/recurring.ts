import type { FundType } from '../fundType'
import type { CategoryLike } from '../types'
import { normalizeAmount } from './amount'
import { toInt, typeMatches } from './shared'
import type { ValidationResult } from './types'

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
