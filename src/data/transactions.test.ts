import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { rpc, from, calls, queryCalls, setResult, setQueryResult } = vi.hoisted(() => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  const queryCalls: Array<{ method: string; args: unknown[] }> = []
  let result: { data: unknown; error: unknown } = { data: [], error: null }
  let queryResult: { data: unknown; error: unknown } = { data: [], error: null }
  let queryLimit: number | null = null

  // Minimal PostgREST builder double. A configured limit slices the returned
  // rows so candidate-truncation regressions are observable in the test.
  const builder: Record<string, unknown> = {
    rpc: (...args: unknown[]) => {
      calls.push({ method: 'rpc', args })
      return Promise.resolve(result)
    },
  }

  for (const method of ['select', 'eq', 'gte', 'lte', 'order']) {
    builder[method] = (...args: unknown[]) => {
      queryCalls.push({ method, args })
      return builder
    }
  }
  builder.limit = (limit: number) => {
    queryCalls.push({ method: 'limit', args: [limit] })
    queryLimit = limit
    return builder
  }
  // PostgREST query builders are intentionally awaitable.
  // oxlint-disable-next-line unicorn/no-thenable
  builder.then = (
    onFulfilled: (value: { data: unknown; error: unknown }) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => {
    const resolved =
      queryLimit != null && Array.isArray(queryResult.data)
        ? { ...queryResult, data: queryResult.data.slice(0, queryLimit) }
        : queryResult
    return Promise.resolve(resolved).then(onFulfilled, onRejected)
  }

  const from = vi.fn((...args: unknown[]) => {
    queryCalls.push({ method: 'from', args })
    queryLimit = null
    return builder
  })

  return {
    rpc: vi.fn(builder.rpc as (...args: unknown[]) => Promise<typeof result>),
    from,
    calls,
    queryCalls,
    setResult: (r: { data: unknown; error: unknown }) => {
      result = r
    },
    setQueryResult: (r: { data: unknown; error: unknown }) => {
      queryResult = r
    },
  }
})

vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }))

import { findNearDuplicatesForDraft } from '../domain/fuzzyDuplicates'
import { fetchMemoHistory, fetchNearDuplicateCandidates } from './transactions'

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  queryCalls.length = 0
  setResult({ data: [], error: null })
  setQueryResult({ data: [], error: null })
})

describe('fetchMemoHistory', () => {
  it('calls the search_memo_history RPC with the trimmed memo and both-direction matching is the RPC contract', async () => {
    setResult({ data: [{ category_id: 'c-food', memo: '스타벅스' }], error: null })

    const rows = await fetchMemoHistory('led-1', '  스타벅스 강남점  ')

    expect(rpc).toHaveBeenCalledWith('search_memo_history', {
      p_ledger: 'led-1',
      p_memo: '스타벅스 강남점',
      p_limit: 50,
    })
    expect(rows).toEqual([{ categoryId: 'c-food', memo: '스타벅스' }])
  })

  it('passes the custom limit through as p_limit', async () => {
    await fetchMemoHistory('led-1', '커피', 10)

    expect(rpc).toHaveBeenCalledWith('search_memo_history', {
      p_ledger: 'led-1',
      p_memo: '커피',
      p_limit: 10,
    })
  })

  it('returns [] without querying when the ledger or memo is empty', async () => {
    expect(await fetchMemoHistory('', '커피')).toEqual([])
    expect(await fetchMemoHistory('led-1', '   ')).toEqual([])
    expect(rpc).not.toHaveBeenCalled()
  })

  it('throws when PostgREST returns an error', async () => {
    setResult({ data: null, error: { message: 'boom' } })
    await expect(fetchMemoHistory('led-1', '커피')).rejects.toEqual({ message: 'boom' })
  })
})

describe('fetchNearDuplicateCandidates', () => {
  it('returns every exact-field candidate before memo compatibility is checked', async () => {
    const databaseRows = Array.from({ length: 45 }, (_, index) => ({
      id: `txn-${String(index + 1).padStart(2, '0')}`,
      ledger_id: 'led-1',
      category_id: 'c-food',
      txn_date: '2026-08-08',
      type: 'expense',
      amount: 12_000,
      memo: index < 20 ? `unrelated-${index}` : '점심 식사',
      source: 'manual',
      recurring_id: null,
      occurrence_month: null,
      created_at: '2026-08-08T00:00:00Z',
      updated_at: '2026-08-08T00:00:00Z',
    }))
    setQueryResult({ data: databaseRows, error: null })

    const candidates = await fetchNearDuplicateCandidates('led-1', {
      txnDate: '2026-08-08',
      type: 'expense',
      amount: 12_000,
      categoryId: 'c-food',
    })
    const matches = findNearDuplicatesForDraft(
      {
        txnDate: '2026-08-08',
        type: 'expense',
        amount: 12_000,
        categoryId: 'c-food',
        memo: '점심',
      },
      candidates,
    )

    expect(queryCalls).not.toContainEqual({ method: 'limit', args: [20] })
    expect(candidates).toHaveLength(45)
    expect(matches).toHaveLength(25)
    expect(matches[0]?.id).toBe('txn-21')
    expect(matches.at(-1)?.id).toBe('txn-45')
  })
})
