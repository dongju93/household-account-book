import { describe, expect, it } from 'vite-plus/test'

import { dataVersionHash, stableStringify } from './hash'

describe('stableStringify', () => {
  it('sorts object keys so insertion order does not change output', () => {
    const a = { b: 1, a: 2 }
    const b = { a: 2, b: 1 }
    expect(stableStringify(a)).toBe(stableStringify(b))
    expect(stableStringify(a)).toBe('{"a":2,"b":1}')
  })

  it('recurses into nested objects and preserves array order', () => {
    const nested = { outer: { z: 1, y: [3, 1, 2] } }
    expect(stableStringify(nested)).toBe('{"outer":{"y":[3,1,2],"z":1}}')
  })
})

describe('dataVersionHash', () => {
  it('is stable across key order', async () => {
    const h1 = await dataVersionHash({ month: '2026-06', summary: { balance: 1 } })
    const h2 = await dataVersionHash({ summary: { balance: 1 }, month: '2026-06' })
    expect(h1).toBe(h2)
    expect(h1).toMatch(/^[0-9a-f]{64}$/)
  })

  it('changes when payload changes', async () => {
    const a = await dataVersionHash({ month: '2026-06', total: 1 })
    const b = await dataVersionHash({ month: '2026-06', total: 2 })
    expect(a).not.toBe(b)
  })
})
