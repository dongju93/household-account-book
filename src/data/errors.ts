// Translate a Supabase/PostgREST error into a user-facing message and flag
// authorization failures so the UI can show them distinctly (spec §9).
export interface DescribedError {
  message: string
  permission: boolean
}

export function describeError(error: unknown): DescribedError {
  const e = error as { code?: string; message?: string } | null
  const code = e?.code ?? ''
  const raw = e?.message ?? ''

  const permission =
    code === '42501' || // insufficient_privilege
    code === 'PGRST301' || // JWT / RLS rejection
    /row-level security|permission denied|not authorized/i.test(raw)

  if (permission) return { message: '이 작업을 수행할 권한이 없습니다.', permission: true }

  // type-match / check-constraint violations from the DB triggers
  if (code === '23514' || /check constraint|does not match category/i.test(raw)) {
    return { message: '입력 값이 규칙에 맞지 않습니다. 구분과 카테고리를 확인하세요.', permission: false }
  }
  if (code === '23505') {
    return { message: '이미 존재하는 값입니다.', permission: false }
  }
  return { message: raw || '오류가 발생했습니다. 다시 시도하세요.', permission: false }
}
