// Cross-tool constants and helpers shared by the budget_pace_* / qna_* hooks.
// Every tool in this app is read-only by design (feat/ai phase 1), so the
// annotation object lives here to keep that guarantee in one place.

export const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true } as const

export const NOT_READY_REASON =
  '가계부 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'

/**
 * Shared category-name matching rule: trimmed substring match that must be
 * UNIQUE. Zero or multiple hits return the candidate names instead, delegating
 * disambiguation to the calling agent (it can re-ask the user or retry with a
 * candidate) rather than guessing on their behalf.
 */
export function resolveCategoryByName<T extends { name: string }>(
  items: readonly T[],
  categoryName: string,
): { match: T } | { candidates: string[] } {
  const trimmed = categoryName.trim()
  const matches = items.filter((item) => item.name.includes(trimmed))
  return matches.length === 1 ? { match: matches[0] } : { candidates: matches.map((m) => m.name) }
}
