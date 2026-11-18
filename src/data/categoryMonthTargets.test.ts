import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { parseMonthTargetChoice } from '../domain/categoryMonthTargets'
import { listCategoryMonthTargets, saveCategoryMonthTarget } from './categoryMonthTargets'

const { rpc, from, responses, calls } = vi.hoisted(() => {
  const responses: { data: unknown[] | null; error: unknown }[] = []
  const calls: { method: string; args: unknown[] }[] = []
  const builder: Record<string, unknown> = {}
  for (const method of ['select', 'eq']) {
    builder[method] = (...args: unknown[]) => {
      calls.push({ method, args })
      return builder
    }
  }
  // oxlint-disable-next-line unicorn/no-thenable
  builder.then = (resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) =>
    Promise.resolve(responses.shift() ?? { data: [], error: null }).then(resolve, reject)
  return { rpc: vi.fn(), from: vi.fn(() => builder), responses, calls }
})
vi.mock('../lib/supabase', () => ({ supabase: { rpc, from } }))

const category = { id: 'food', ledgerId: 'ledger', type: 'expense' as const }
const ym = { year: 2026, month: 11 }
const row = { category_id: 'food', month: '2026-11-01', source: 'custom', custom_amount: '600000' }

beforeEach(() => {
  vi.clearAllMocks()
  calls.length = 0
  responses.length = 0
  rpc.mockResolvedValue({ error: null })
})

describe('monthly target persistence boundary', () => {
  it('scopes reads to ledger and month and parses database amounts', async () => {
    responses.push({ data: [row], error: null })
    expect(await listCategoryMonthTargets('ledger', ym)).toEqual([
      { categoryId: 'food', month: '2026-11-01', source: 'custom', customAmount: 600000 },
    ])
    expect(calls).toContainEqual({ method: 'eq', args: ['ledger_id', 'ledger'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['month', '2026-11-01'] })
  })
  it.each([
    { ...row, source: 'other' },
    { ...row, custom_amount: null },
    { ...row, custom_amount: 1.5 },
    { ...row, month: '2026-13-01' },
    { ...row, month: '2026-11-02' },
    null,
  ])('rejects corrupt persisted state: %s', async (invalid) => {
    responses.push({ data: [invalid], error: null })
    await expect(listCategoryMonthTargets('ledger', ym)).rejects.toThrow('월별 예산 데이터')
  })
  it('sends only a validated category/month choice; global switching never sends a replacement amount', async () => {
    const choice = parseMonthTargetChoice('custom', '600,000')
    if (!choice.ok) throw new Error('invalid fixture')
    await saveCategoryMonthTarget(category, ym, choice.value)
    expect(rpc).toHaveBeenLastCalledWith('set_category_month_target', {
      p_ledger: 'ledger',
      p_category: 'food',
      p_month: '2026-11-01',
      p_source: 'custom',
      p_custom_amount: 600000,
    })
    await saveCategoryMonthTarget(category, ym, { source: 'global' })
    expect(rpc).toHaveBeenLastCalledWith('set_category_month_target', {
      p_ledger: 'ledger',
      p_category: 'food',
      p_month: '2026-11-01',
      p_source: 'global',
      p_custom_amount: null,
    })
    expect(from).not.toHaveBeenCalled()
  })
  it('propagates read/write failures rather than silently falling back to globals', async () => {
    responses.push({ data: null, error: { code: '42P01' } })
    await expect(listCategoryMonthTargets('ledger', ym)).rejects.toEqual({ code: '42P01' })
    rpc.mockResolvedValue({ error: { code: '42501' } })
    await expect(saveCategoryMonthTarget(category, ym, { source: 'global' })).rejects.toEqual({
      code: '42501',
    })
  })
})
