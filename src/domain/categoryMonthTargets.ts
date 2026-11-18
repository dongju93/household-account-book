import { monthKey, type YearMonth } from '../lib/month'
import type { CategoryLike } from './types'
import type { ValidationResult } from './validation/types'

declare const targetAmountBrand: unique symbol
/** Constructed only by the boundary parser; integer KRW within JS's exact range. */
export type TargetAmount = number & { readonly [targetAmountBrand]: true }

export type MonthTargetChoice = { source: 'global' } | { source: 'custom'; amount: TargetAmount }

export interface CategoryMonthTarget {
  categoryId: string
  month: string // YYYY-MM-01
  source: MonthTargetChoice['source']
  customAmount: TargetAmount
}

export function parseTargetAmount(raw: unknown): TargetAmount | null {
  const cleaned = typeof raw === 'string' ? raw.replace(/[,\s₩]/g, '') : raw
  if (typeof cleaned === 'string' && !/^\d+$/.test(cleaned)) return null
  if (typeof cleaned !== 'string' && typeof cleaned !== 'number') return null
  const amount = Number(cleaned)
  return Number.isSafeInteger(amount) && amount >= 0 ? (amount as TargetAmount) : null
}

export function parseMonthTargetChoice(
  source: MonthTargetChoice['source'],
  rawAmount: unknown,
): ValidationResult<MonthTargetChoice> {
  if (source === 'global') return { ok: true, value: { source } }
  const amount = parseTargetAmount(rawAmount)
  return amount === null
    ? {
        ok: false,
        errors: { amount: '금액은 0 이상의 안전한 범위의 원 단위 정수로 입력해 주세요.' },
      }
    : { ok: true, value: { source, amount } }
}

/** Resolve once before calculations; never mutate global settings. */
export function applyCategoryMonthTargets<T extends CategoryLike>(
  categories: readonly T[],
  targets: readonly CategoryMonthTarget[],
  ym: YearMonth,
): T[] {
  const month = `${monthKey(ym.year, ym.month)}-01`
  const customById = new Map(
    targets
      .filter((t) => t.month === month && t.source === 'custom')
      .map((t) => [t.categoryId, t.customAmount]),
  )
  return categories.map((category) => {
    const amount = customById.get(category.id)
    if (amount === undefined) return category
    if (category.type === 'expense') return { ...category, budgetAmount: amount }
    if (category.type === 'saving') return { ...category, goalAmount: amount }
    return category
  })
}
