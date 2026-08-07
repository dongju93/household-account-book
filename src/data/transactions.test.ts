import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { rpc, calls, setResult } = vi.hoisted(() => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  let result: { data: unknown; error: unknown } = { data: [], error: null }

  // Minimal PostgREST builder double: every method records its call and returns
  // the builder. `rpc` is the terminal call in fetchMemoHistory, so it resolves
  // the result.
  const builder: Record<string, unknown> = {
    rpc: (...args: unknown[]) => {
      calls.push({ method: 'rpc', args })
      return Promise.resolve(result)
    },
  }

  return {
    rpc: vi.fn(builder.rpc as (...args: unknown[]) => Promise<typeof result>),
    calls,
    setResult: (r: { data: unknown; error: unknown }) => {
      result = r
    },
  }
})

vi.mock('../lib/supabase', () => ({ supabase: { rpc } }))

import { fetchMemoHistory } from './transactions'

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  setResult({ data: [], error: null })
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
