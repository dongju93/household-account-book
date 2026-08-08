import { describe, expect, it } from 'vite-plus/test'

import {
  type DuplicateCandidateTxn,
  findFuzzyDuplicateGroups,
  findNearDuplicatesForDraft,
  isNearDuplicate,
  normalizeMemo,
} from './fuzzyDuplicates'

let seq = 0
function txn(overrides: Partial<DuplicateCandidateTxn> = {}): DuplicateCandidateTxn {
  seq += 1
  return {
    id: `t${String(seq).padStart(3, '0')}`,
    txnDate: '2026-06-10',
    type: 'expense',
    amount: 10_000,
    categoryId: 'food',
    memo: null,
    ...overrides,
  }
}

describe('normalizeMemo', () => {
  it('treats null, blank, and whitespace-only memos as the same empty memo', () => {
    expect(normalizeMemo(null)).toBe('')
    expect(normalizeMemo('   ')).toBe('')
    expect(normalizeMemo(undefined)).toBe('')
  })

  it('lowercases and collapses internal whitespace', () => {
    expect(normalizeMemo('  Cafe   Latte ')).toBe('cafe latte')
  })
})

describe('isNearDuplicate', () => {
  it('matches the same day, amount, category, and memo (the old exact key)', () => {
    expect(isNearDuplicate(txn({ memo: '점심' }), txn({ memo: '점심' }))).toBe(true)
  })

  it('matches across a one-day gap in either direction', () => {
    const a = txn({ txnDate: '2026-06-05', memo: '점심' })
    const b = txn({ txnDate: '2026-06-06', memo: '점심' })
    expect(isNearDuplicate(a, b)).toBe(true)
    expect(isNearDuplicate(b, a)).toBe(true)
  })

  it('matches across a month boundary that is still one day apart', () => {
    expect(isNearDuplicate(txn({ txnDate: '2026-06-30' }), txn({ txnDate: '2026-07-01' }))).toBe(
      true,
    )
  })

  it('rejects a two-day gap', () => {
    expect(isNearDuplicate(txn({ txnDate: '2026-06-05' }), txn({ txnDate: '2026-06-07' }))).toBe(
      false,
    )
  })

  it('matches when one side has no memo', () => {
    expect(isNearDuplicate(txn({ memo: '커피' }), txn({ memo: null }))).toBe(true)
  })

  it('matches when one memo contains the other', () => {
    expect(isNearDuplicate(txn({ memo: '스타벅스 커피' }), txn({ memo: '커피' }))).toBe(true)
  })

  it('does not let a single character bridge two unrelated memos', () => {
    expect(isNearDuplicate(txn({ memo: '커피' }), txn({ memo: '커' }))).toBe(false)
  })

  it('rejects unrelated memos on the same day', () => {
    expect(isNearDuplicate(txn({ memo: '점심' }), txn({ memo: '택시' }))).toBe(false)
  })

  it('requires the amount, category, and type to match exactly', () => {
    const base = txn({ memo: '점심' })
    expect(isNearDuplicate(base, txn({ memo: '점심', amount: 10_001 }))).toBe(false)
    expect(isNearDuplicate(base, txn({ memo: '점심', categoryId: 'cafe' }))).toBe(false)
    expect(isNearDuplicate(base, txn({ memo: '점심', type: 'saving' }))).toBe(false)
  })
})

describe('findFuzzyDuplicateGroups', () => {
  it('groups an exact repeat and reports reason "exact"', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: '점심' }),
      txn({ id: 'b', txnDate: '2026-06-05', memo: '점심' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      reason: 'exact',
      firstDate: '2026-06-05',
      lastDate: '2026-06-05',
      sharedMemo: '점심',
    })
    expect(groups[0].txns.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('groups a next-day repeat that the exact key missed, as "adjacent_day"', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: '점심' }),
      txn({ id: 'b', txnDate: '2026-06-06', memo: '점심' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0]).toMatchObject({
      reason: 'adjacent_day',
      firstDate: '2026-06-05',
      lastDate: '2026-06-06',
    })
  })

  it('groups a same-day repeat whose memo was left blank, as "similar_memo"', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: '점심' }),
      txn({ id: 'b', txnDate: '2026-06-05', memo: null }),
    ])
    expect(groups).toHaveLength(1)
    // No single memo describes the group, so callers cannot narrow a search by one.
    expect(groups[0]).toMatchObject({ reason: 'similar_memo', sharedMemo: null })
  })

  it('withholds sharedMemo when the grouped memos differ only in collapsed whitespace', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: '카페 라떼' }),
      txn({ id: 'b', txnDate: '2026-06-05', memo: '카페   라떼' }),
    ])
    expect(groups).toHaveLength(1)
    // Normalization makes these the same purchase, so the reason is still "exact"…
    expect(groups[0].reason).toBe('exact')
    // …but neither raw spelling is a literal substring of the other, so no single
    // value narrows a memo search to *all* members.
    expect(groups[0].sharedMemo).toBeNull()
  })

  it('withholds sharedMemo when the grouped memos differ only in case', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: 'Cafe Latte' }),
      txn({ id: 'b', txnDate: '2026-06-05', memo: 'cafe latte' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].reason).toBe('exact')
    expect(groups[0].sharedMemo).toBeNull()
  })

  it('keeps sharedMemo when only surrounding whitespace differs', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: '  점심  ' }),
      txn({ id: 'b', txnDate: '2026-06-05', memo: '점심' }),
    ])
    expect(groups).toHaveLength(1)
    // Trimming does not change what a substring search finds, so this narrowing
    // value still describes every member.
    expect(groups[0].sharedMemo).toBe('점심')
  })

  it('never chains a group past a two-day span', () => {
    // 06-05 ~ 06-06 are near duplicates and 06-06 ~ 06-07 are too, but 06-05 and
    // 06-07 are not — an anchor-only check would merge all three.
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: '점심' }),
      txn({ id: 'b', txnDate: '2026-06-06', memo: '점심' }),
      txn({ id: 'c', txnDate: '2026-06-07', memo: '점심' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].txns.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('does not let a blank memo bridge two unrelated memos into one group', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', txnDate: '2026-06-05', memo: null }),
      txn({ id: 'b', txnDate: '2026-06-05', memo: '점심' }),
      txn({ id: 'c', txnDate: '2026-06-05', memo: '택시' }),
    ])
    expect(groups).toHaveLength(1)
    expect(groups[0].txns.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('keeps different amounts, categories, and types in separate buckets', () => {
    expect(
      findFuzzyDuplicateGroups([
        txn({ amount: 10_000 }),
        txn({ amount: 20_000 }),
        txn({ categoryId: 'cafe' }),
        txn({ type: 'saving' }),
      ]),
    ).toEqual([])
  })

  it('returns nothing for a single transaction or an empty ledger', () => {
    expect(findFuzzyDuplicateGroups([])).toEqual([])
    expect(findFuzzyDuplicateGroups([txn()])).toEqual([])
  })

  it('orders groups by total exposure (amount × count) descending', () => {
    const groups = findFuzzyDuplicateGroups([
      txn({ id: 'a', amount: 5_000, categoryId: 'cafe', memo: '커피' }),
      txn({ id: 'b', amount: 5_000, categoryId: 'cafe', memo: '커피' }),
      txn({ id: 'c', amount: 40_000, categoryId: 'food', memo: '회식' }),
      txn({ id: 'd', amount: 40_000, categoryId: 'food', memo: '회식' }),
    ])
    expect(groups.map((g) => g.amount)).toEqual([40_000, 5_000])
  })
})

describe('findNearDuplicatesForDraft', () => {
  const draft = {
    txnDate: '2026-06-05',
    type: 'expense' as const,
    amount: 20_000,
    categoryId: 'food',
    memo: '점심',
  }

  it('finds an existing row one day off the draft date', () => {
    const existing = [txn({ id: 'x', txnDate: '2026-06-04', amount: 20_000, memo: '점심' })]
    expect(findNearDuplicatesForDraft(draft, existing).map((t) => t.id)).toEqual(['x'])
  })

  it('returns nothing when no row is close enough', () => {
    const existing = [
      txn({ id: 'x', txnDate: '2026-06-02', amount: 20_000, memo: '점심' }),
      txn({ id: 'y', txnDate: '2026-06-05', amount: 21_000, memo: '점심' }),
      txn({ id: 'z', txnDate: '2026-06-05', amount: 20_000, memo: '택시' }),
    ]
    expect(findNearDuplicatesForDraft(draft, existing)).toEqual([])
  })

  it('excludes the row being edited so a re-save never warns about itself', () => {
    const existing = [txn({ id: 'self', txnDate: '2026-06-05', amount: 20_000, memo: '점심' })]
    expect(findNearDuplicatesForDraft(draft, existing, { excludeId: 'self' })).toEqual([])
  })
})
