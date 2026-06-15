import type { FundType } from '../fundType'
import { hasBudget, hasGoal } from '../fundType'
import { normalizeNonNegative } from './amount'
import { isProvided } from './shared'
import type { ValidationResult } from './types'

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
