import type { FundType } from '../fundType'
import { isFundType } from '../fundType'
import { typeMatches } from '../validation/shared'

/** Active category snapshot used by NL draft resolve (id/name/type only). */
export interface NlCategoryRef {
  id: string
  name: string
  type: FundType
}

/** Raw draft shape from Edge `nl_txn_parse` (or a mock). */
export interface NlTxnDraftRaw {
  amount: unknown
  type: unknown
  categoryName: string | null
  date: string | null
  memo: string | null
}

export interface NlTxnDraftNormalized {
  amount: number | null
  type: FundType | null
  categoryId: string | null
  categoryName: string | null
  date: string | null
  memo: string | null
  warnings: string[]
}

export const NL_MEMO_MAX_LENGTH = 200

const WARN_AMOUNT = '금액은 0보다 큰 정수여야 합니다.'
const WARN_CATEGORY_NONE = '일치하는 카테고리를 찾지 못했습니다. 직접 선택해 주세요.'
const WARN_CATEGORY_MANY = '카테고리가 여러 개 일치합니다. 직접 선택해 주세요.'
const WARN_CATEGORY_TYPE = '카테고리 구분이 거래 구분과 일치하지 않습니다.'
const WARN_MEMO_TRUNCATED = '메모는 200자까지 저장됩니다.'
const WARN_DATE = '날짜 형식이 올바르지 않습니다.'

/**
 * Resolve an LLM-suggested category name to a single category id.
 *
 * Unlike WebMCP `resolveCategoryByName` (substring-only, multi-row same name OK),
 * this is for silent form prefill: exact match first, then unique substring only.
 * 0 / many / type mismatch → no id + warnings (never guess among ambiguities).
 */
export function resolveNlCategory(
  categories: readonly NlCategoryRef[],
  name: string | null | undefined,
  type: FundType | null | undefined,
): { categoryId: string } | { warnings: string[] } {
  if (name == null) return { warnings: [] }
  const needle = name.trim()
  if (!needle) return { warnings: [] }

  const needleLower = needle.toLowerCase()
  const nameMatches = (c: NlCategoryRef) => c.name.trim().toLowerCase() === needleLower
  const substringMatches = (c: NlCategoryRef) => c.name.toLowerCase().includes(needleLower)

  const pool = type != null ? categories.filter((c) => typeMatches(type, c.type)) : [...categories]

  const exact = pool.filter(nameMatches)
  if (exact.length === 1) return { categoryId: exact[0].id }
  if (exact.length > 1) return { warnings: [WARN_CATEGORY_MANY] }

  const partial = pool.filter(substringMatches)
  if (partial.length === 1) return { categoryId: partial[0].id }
  if (partial.length > 1) return { warnings: [WARN_CATEGORY_MANY] }

  // No match in type-filtered pool: distinguish type mismatch vs unknown name.
  if (type != null) {
    const anyExact = categories.filter(nameMatches)
    const anyPartial = anyExact.length > 0 ? anyExact : categories.filter(substringMatches)
    if (anyPartial.length > 0) return { warnings: [WARN_CATEGORY_TYPE] }
  }

  return { warnings: [WARN_CATEGORY_NONE] }
}

/**
 * NL amount rules are stricter than form `normalizeAmount`: non-integers become
 * null + warning (no silent trunc of 4500.5 → 4500), matching Edge integer schema.
 */
export function normalizeNlAmount(raw: unknown): { amount: number | null; warning?: string } {
  if (raw === null || raw === undefined) return { amount: null }
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw <= 0) {
    return { amount: null, warning: WARN_AMOUNT }
  }
  return { amount: raw }
}

/** Trim; empty → null; over DB limit → truncate + field warning. */
export function normalizeNlMemo(raw: string | null | undefined): {
  memo: string | null
  warning?: string
} {
  if (raw == null) return { memo: null }
  const trimmed = raw.trim()
  if (!trimmed) return { memo: null }
  if (trimmed.length > NL_MEMO_MAX_LENGTH) {
    return {
      memo: trimmed.slice(0, NL_MEMO_MAX_LENGTH),
      warning: WARN_MEMO_TRUNCATED,
    }
  }
  return { memo: trimmed }
}

function normalizeNlType(raw: unknown): FundType | null {
  return isFundType(raw) ? raw : null
}

function normalizeNlDate(raw: string | null | undefined): {
  date: string | null
  warning?: string
} {
  if (raw == null || raw.trim() === '') return { date: null }
  const date = raw.trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { date: null, warning: WARN_DATE }
  }
  return { date }
}

/**
 * Normalize an NL parse draft for form prefill. Does not validate completeness
 * (missing fields stay null); that is left to `validateTransactionInput` on save.
 */
export function normalizeNlTxnDraft(
  raw: NlTxnDraftRaw,
  categories: readonly NlCategoryRef[],
): NlTxnDraftNormalized {
  const warnings: string[] = []

  const amountResult = normalizeNlAmount(raw.amount)
  if (amountResult.warning) warnings.push(amountResult.warning)

  const type = normalizeNlType(raw.type)

  const categoryName =
    raw.categoryName == null || raw.categoryName.trim() === '' ? null : raw.categoryName.trim()

  const resolved = resolveNlCategory(categories, categoryName, type)
  let categoryId: string | null = null
  if ('categoryId' in resolved) {
    categoryId = resolved.categoryId
  } else {
    warnings.push(...resolved.warnings)
  }

  // When the model omitted type but category resolved uniquely, prefill type from it.
  let resolvedType = type
  if (resolvedType == null && categoryId != null) {
    const cat = categories.find((c) => c.id === categoryId)
    if (cat) resolvedType = cat.type
  }

  const dateResult = normalizeNlDate(raw.date)
  if (dateResult.warning) warnings.push(dateResult.warning)

  const memoResult = normalizeNlMemo(raw.memo)
  if (memoResult.warning) warnings.push(memoResult.warning)

  return {
    amount: amountResult.amount,
    type: resolvedType,
    categoryId,
    categoryName,
    date: dateResult.date,
    memo: memoResult.memo,
    warnings,
  }
}
