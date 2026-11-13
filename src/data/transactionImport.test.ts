import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { CSV_HEADERS, parseTransactionCsv } from '../domain/importTransactions'
import { checkExistingImportTransactions, importTransactions } from './transactionImport'

const { rpc, from, responses, calls } = vi.hoisted(() => {
  const responses: { data: unknown[] | null; error: unknown }[] = []
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq', 'in', 'order', 'limit', 'abortSignal', 'gt']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  // oxlint-disable-next-line unicorn/no-thenable
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(responses.shift() ?? { data: [], error: null }).then(resolve, reject)
  return { rpc: vi.fn(), from: vi.fn(() => builder), builder, responses, calls }
})
vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }))

const category = { id: 'food', name: '식비', type: 'expense' as const, isActive: true }
function parsed(rows = '2026-11-14,지출,식비,12000,점심') {
  const result = parseTransactionCsv(`${CSV_HEADERS.join(',')}\n${rows}`, [category])
  if (!result.ok) throw new Error('invalid test fixture')
  return result.value
}
const databaseRow = {
  id: 'txn',
  category_id: 'food',
  txn_date: '2026-11-14',
  type: 'expense',
  amount: 12000,
  memo: '점심',
}

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  responses.length = 0
  rpc.mockResolvedValue({ data: 1, error: null })
})

describe('CSV persistence boundary', () => {
  it('maps only validated wire fields and preserves the request id for atomic retries', async () => {
    const value = parsed()
    expect(await importTransactions('ledger', 'request', value)).toBe(1)
    expect(rpc).toHaveBeenCalledWith('import_transactions', {
      p_ledger: 'ledger',
      p_request_id: 'request',
      p_rows: [
        { categoryId: 'food', txnDate: '2026-11-14', type: 'expense', amount: 12000, memo: '점심' },
      ],
    })
    expect(from).not.toHaveBeenCalled()
  })
  it('propagates DB rejections and treats a mismatched result count as uncertain', async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { code: '42501' } })
    await expect(importTransactions('ledger', 'request', parsed())).rejects.toEqual({
      code: '42501',
    })
    rpc.mockResolvedValueOnce({ data: 0, error: null })
    await expect(importTransactions('ledger', 'request', parsed())).rejects.toThrow('저장 결과')
  })
  it('walks every existing page with a ledger filter, cancellation, and deduplicates warnings', async () => {
    responses.push(
      {
        data: Array.from({ length: 500 }, (_, i) => ({ ...databaseRow, id: `txn-${i}` })),
        error: null,
      },
      { data: [databaseRow], error: null },
    )
    const signal = new AbortController().signal
    const progress = vi.fn()
    const warnings = await checkExistingImportTransactions(
      'ledger',
      parsed().rows,
      signal,
      progress,
    )
    expect(warnings).toHaveLength(1)
    expect(from).toHaveBeenCalledTimes(2)
    expect(calls.filter((call) => call.method === 'eq')).toEqual(
      Array(2).fill({ method: 'eq', args: ['ledger_id', 'ledger'] }),
    )
    expect(calls).toContainEqual({ method: 'gt', args: ['id', 'txn-499'] })
    expect(calls).toContainEqual({ method: 'abortSignal', args: [signal] })
    expect(progress).toHaveBeenLastCalledWith(100)
  })
  it('splits large date lists into bounded queries', async () => {
    const rows = parsed(
      Array.from(
        { length: 31 },
        (_, i) => `2026-01-${String(i + 1).padStart(2, '0')},지출,식비,1,`,
      ).join('\n'),
    ).rows
    await checkExistingImportTransactions('ledger', rows, new AbortController().signal, vi.fn())
    expect(
      calls.filter((call) => call.method === 'in').map((call) => (call.args[1] as string[]).length),
    ).toEqual([30, 1])
  })
  it('fails closed on duplicate lookup errors and never runs an aborted query', async () => {
    responses.push({ data: null, error: { message: 'network' } })
    await expect(
      checkExistingImportTransactions(
        'ledger',
        parsed().rows,
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toEqual({ message: 'network' })
    vi.clearAllMocks()
    const controller = new AbortController()
    controller.abort()
    await expect(
      checkExistingImportTransactions('ledger', parsed().rows, controller.signal, vi.fn()),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(from).not.toHaveBeenCalled()
  })
})
