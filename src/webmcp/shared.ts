// Cross-tool constants and helpers shared by the budget_pace_* / qna_* hooks.
// Those tools are read-only by design (feat/ai phase 1), so the annotation
// object lives here to keep that guarantee in one place. month_close_review
// is the one tool that writes (see MONTH_CLOSE_ANNOTATIONS in
// useMonthCloseTools.ts) and deliberately does not use this constant.

export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true } as const

export const NOT_READY_REASON =
  '가계부 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'

/**
 * Shared category-name matching rule: trimmed substring match against a
 * single UNIQUE name. `categories_unique_active_name` only enforces
 * uniqueness among active rows, so a renamed/deactivated category can leave
 * an inactive row sharing a name with the active one (or with another
 * inactive one) — matching against all categories (as qna_category_detail
 * does, to keep an archived category's history reachable) can then return
 * several rows for the SAME name. That's not real ambiguity, so all rows
 * sharing the one matched name are returned together for the caller to
 * aggregate. Zero hits, or hits spanning more than one distinct name, return
 * the candidate names instead, delegating disambiguation to the calling
 * agent (it can re-ask the user or retry with a candidate) rather than
 * guessing on their behalf.
 */
export function resolveCategoryByName<T extends { name: string }>(
  items: readonly T[],
  categoryName: string,
): { matches: T[] } | { candidates: string[] } {
  const trimmed = categoryName.trim()
  const matches = items.filter((item) => item.name.includes(trimmed))
  const distinctNames = [...new Set(matches.map((m) => m.name))]
  return distinctNames.length === 1 ? { matches } : { candidates: distinctNames }
}
