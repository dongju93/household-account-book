// The four 자금 구분 (fund types). Source of truth for both the TS union and
// any UI that iterates over the set (segmented control, filters, legends).
export const FUND_TYPES = ['income', 'expense', 'saving', 'investment'] as const

export type FundType = (typeof FUND_TYPES)[number]

export const FUND_TYPE_LABELS: Record<FundType, string> = {
  income: '수입',
  expense: '지출',
  saving: '저축',
  investment: '투자',
}

export function fundTypeLabel(type: FundType): string {
  return FUND_TYPE_LABELS[type]
}

// 지출 manages a budget; 저축 manages a goal; 수입/투자 have neither (spec §2.2).
export function hasBudget(type: FundType): boolean {
  return type === 'expense'
}

export function hasGoal(type: FundType): boolean {
  return type === 'saving'
}

export function isFundType(value: unknown): value is FundType {
  return typeof value === 'string' && (FUND_TYPES as readonly string[]).includes(value)
}
