import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { from, calls, setResults } = vi.hoisted(() => {
  const calls: Array<{ method: string; args: unknown[] }> = []
  let results: Array<{ data: unknown; error: unknown }> = []

  // Minimal PostgREST builder double: chain methods record their call and return
  // the builder. `.limit()` is terminal in fetchTransactionsInRange, so it
  // settles the await by resolving the next prepared {data,error} — matching
  // PostgREST's resolve-with-error contract (the caller checks `error`, not a
  // rejection).
  function makeBuilder(): Record<string, (...args: unknown[]) => unknown> {
    const builder: Record<string, (...args: unknown[]) => unknown> = {
      select: (...args: unknown[]) => {
        calls.push({ method: 'select', args })
        return builder
      },
      eq: (...args: unknown[]) => {
        calls.push({ method: 'eq', args })
        return builder
      },
      gte: (...args: unknown[]) => {
        calls.push({ method: 'gte', args })
        return builder
      },
      lt: (...args: unknown[]) => {
        calls.push({ method: 'lt', args })
        return builder
      },
      or: (...args: unknown[]) => {
        calls.push({ method: 'or', args })
        return builder
      },
      order: (...args: unknown[]) => {
        calls.push({ method: 'order', args })
        return builder
      },
      limit: (...args: unknown[]) => {
        calls.push({ method: 'limit', args })
        return Promise.resolve(results.shift() ?? { data: [], error: null })
      },
    }
    return builder
  }

  return {
    from: vi.fn(() => makeBuilder()),
    calls,
    setResults: (r: Array<{ data: unknown; error: unknown }>) => {
      results = r
    },
  }
})

vi.mock('../lib/supabase', () => ({ supabase: { from } }))

import { RANGE_PAGE_SIZE, fetchTransactionsInRange } from './summary'

type Row = Record<string, unknown>
function makeRow(id: string, date: string): Row {
  return {
    id,
    ledger_id: 'led-1',
    category_id: 'c',
    txn_date: date,
    type: 'expense',
    amount: 1000,
    memo: null,
    source: 'manual',
    recurring_id: null,
    occurrence_month: null,
    created_at: null,
    updated_at: null,
  }
}

function methods(): string[] {
  return calls.map((c) => c.method)
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  setResults([])
})

describe('fetchTransactionsInRange', () => {
  it('returns all rows in one round-trip when the page fits under RANGE_PAGE_SIZE', async () => {
    setResults([{ data: [makeRow('a', '2024-06-30'), makeRow('b', '2024-06-29')], error: null }])

    const rows = await fetchTransactionsInRange('led-1', '2024-01-01', '2024-07-01')

    expect(rows.map((r) => r.id)).toEqual(['a', 'b'])
    expect(from).toHaveBeenCalledTimes(1)
    expect(methods()).not.toContain('or')
  })

  it('orders by (txn_date desc, id desc) and caps with the +1 sentinel', async () => {
    setResults([{ data: [], error: null }])

    await fetchTransactionsInRange('led-1', '2024-01-01', '2024-07-01')

    expect(calls.filter((c) => c.method === 'order')).toEqual([
      { method: 'order', args: ['txn_date', { ascending: false }] },
      { method: 'order', args: ['id', { ascending: false }] },
    ])
    expect(calls).toContainEqual({ method: 'limit', args: [RANGE_PAGE_SIZE + 1] })
  })

  it('drains subsequent keyset pages using the cursor from the last kept row', async () => {
    // page 1 has RANGE_PAGE_SIZE + 1 rows => the sentinel fires (more remain).
    // The cursor is rows[RANGE_PAGE_SIZE - 1] (index 499) => id 'p1-499'.
    const page1 = Array.from({ length: RANGE_PAGE_SIZE + 1 }, (_, i) =>
      makeRow(`p1-${i}`, '2024-06-30'),
    )
    const page2 = [makeRow('p2-0', '2024-01-15'), makeRow('p2-1', '2024-01-10')]
    setResults([
      { data: page1, error: null },
      { data: page2, error: null },
    ])

    const rows = await fetchTransactionsInRange('led-1', '2024-01-01', '2024-07-01')

    expect(rows).toHaveLength(RANGE_PAGE_SIZE + 2)
    expect(rows[0].id).toBe('p1-0')
    expect(rows[RANGE_PAGE_SIZE - 1].id).toBe('p1-499')
    expect(rows[RANGE_PAGE_SIZE].id).toBe('p2-0')
    expect(rows[RANGE_PAGE_SIZE + 1].id).toBe('p2-1')

    expect(from).toHaveBeenCalledTimes(2)
    const orCalls = calls.filter((c) => c.method === 'or')
    expect(orCalls).toHaveLength(1)
    expect(orCalls[0].args[0]).toBe(
      'txn_date.lt.2024-06-30,and(txn_date.eq.2024-06-30,id.lt.p1-499)',
    )
  })

  it('stops as soon as a page returns fewer than RANGE_PAGE_SIZE rows', async () => {
    const page1 = Array.from({ length: RANGE_PAGE_SIZE + 1 }, (_, i) =>
      makeRow(`p1-${i}`, '2024-06-30'),
    )
    const page2 = [makeRow('p2-0', '2024-05-01')]
    setResults([
      { data: page1, error: null },
      { data: page2, error: null },
    ])

    const rows = await fetchTransactionsInRange('led-1', '2024-01-01', '2024-07-01')

    expect(rows).toHaveLength(RANGE_PAGE_SIZE + 1)
    expect(from).toHaveBeenCalledTimes(2)
  })

  it('propagates a PostgREST error from the first page', async () => {
    setResults([{ data: null, error: { code: '42501', message: 'rls' } }])

    await expect(fetchTransactionsInRange('led-1', '2024-01-01', '2024-07-01')).rejects.toEqual({
      code: '42501',
      message: 'rls',
    })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('propagates an error from a later page rather than returning a partial set', async () => {
    const page1 = Array.from({ length: RANGE_PAGE_SIZE + 1 }, (_, i) =>
      makeRow(`p1-${i}`, '2024-06-30'),
    )
    setResults([
      { data: page1, error: null },
      { data: null, error: { message: 'boom' } },
    ])

    await expect(fetchTransactionsInRange('led-1', '2024-01-01', '2024-07-01')).rejects.toEqual({
      message: 'boom',
    })
    expect(from).toHaveBeenCalledTimes(2)
  })
})
