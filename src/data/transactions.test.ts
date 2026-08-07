import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { from, calls, setResult } = vi.hoisted(() => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  let result: { data: unknown; error: unknown } = { data: [], error: null }

  // Minimal PostgREST builder double: every method records its call and returns
  // the builder. `limit` is the terminal call in every chain under test, so it
  // resolves the result — keeping the builder itself non-thenable.
  const builder: Record<string, unknown> = {
    limit: (...args: unknown[]) => {
      calls.push({ method: 'limit', args })
      return Promise.resolve(result)
    },
  }
  for (const method of ['select', 'eq', 'not', 'filter', 'order']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }

  const from = vi.fn((table: string) => {
    calls.push({ method: 'from', args: [table] })
    return builder
  })

  return {
    from,
    calls,
    setResult: (r: { data: unknown; error: unknown }) => {
      result = r
    },
  }
})

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { fetchMemoHistory, memoSearchPattern } from './transactions'

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  setResult({ data: [], error: null })
})

describe('memoSearchPattern', () => {
  it('escapes the POSIX ERE metacharacters that would otherwise act as a pattern', () => {
    expect(memoSearchPattern('3*4')).toBe('3\\*4')
    expect(memoSearchPattern('a.b')).toBe('a\\.b')
    expect(memoSearchPattern('(주)한빛')).toBe('\\(주\\)한빛')
    expect(memoSearchPattern('c:\\tmp')).toBe('c:\\\\tmp')
    expect(memoSearchPattern('^시작$')).toBe('\\^시작\\$')
  })

  it('leaves LIKE metacharacters alone — they are ordinary to a regex', () => {
    expect(memoSearchPattern('50% 할인')).toBe('50% 할인')
    expect(memoSearchPattern('a_b')).toBe('a_b')
  })

  it('leaves ordinary memo text untouched', () => {
    expect(memoSearchPattern('스타벅스 아메리카노')).toBe('스타벅스 아메리카노')
  })
})

describe('fetchMemoHistory', () => {
  it('searches with an escaped imatch pattern instead of ilike', async () => {
    setResult({ data: [{ category_id: 'c-food', memo: '3*4 커피' }], error: null })

    const rows = await fetchMemoHistory('led-1', '  3*4  ')

    expect(calls).toContainEqual({ method: 'filter', args: ['memo', 'imatch', '3\\*4'] })
    expect(calls.some((c) => c.method === 'ilike')).toBe(false)
    expect(rows).toEqual([{ categoryId: 'c-food', memo: '3*4 커피' }])
  })

  it('orders by (txn_date, id) so the limit truncates deterministically', async () => {
    await fetchMemoHistory('led-1', '커피')

    const orders = calls.filter((c) => c.method === 'order').map((c) => c.args[0])
    expect(orders).toEqual(['txn_date', 'id'])
  })

  it('returns [] without querying when the ledger or memo is empty', async () => {
    expect(await fetchMemoHistory('', '커피')).toEqual([])
    expect(await fetchMemoHistory('led-1', '   ')).toEqual([])
    expect(from).not.toHaveBeenCalled()
  })

  it('throws when PostgREST returns an error', async () => {
    setResult({ data: null, error: { message: 'boom' } })
    await expect(fetchMemoHistory('led-1', '커피')).rejects.toEqual({ message: 'boom' })
  })
})
