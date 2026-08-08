import { describe, expect, it } from 'vite-plus/test'

import type { AchievementRow } from './achievement'
import {
  findBudgetAndGoalFindings,
  findDuplicateCandidates,
  findMissingRecurringOccurrences,
  findUnmemoedLargeExpenses,
  reviewMonth,
} from './monthClose'
import type { CategoryLike, RecurringItem, Transaction } from './types'

const JUN_2026 = { year: 2026, month: 6 } as const

let seq = 0
function txn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    ledgerId: 'ledger-1',
    categoryId: 'food',
    txnDate: '2026-06-10',
    type: 'expense',
    amount: 10_000,
    memo: null,
    source: 'manual',
    recurringId: null,
    occurrenceMonth: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

function recurring(overrides: Partial<RecurringItem> = {}): RecurringItem {
  seq += 1
  return {
    id: `r${seq}`,
    ledgerId: 'ledger-1',
    categoryId: 'food',
    name: '월세',
    type: 'expense',
    amount: 500_000,
    startMonth: '2026-01-01',
    endMonth: null,
    dayOfMonth: 1,
    isActive: true,
    memo: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('findMissingRecurringOccurrences', () => {
  it('returns nothing when every active item materialized this month', () => {
    const item = recurring({ id: 'r1' })
    const materialized = [
      txn({ source: 'recurring', recurringId: 'r1', occurrenceMonth: '2026-06-01' }),
    ]
    expect(findMissingRecurringOccurrences([item], materialized, JUN_2026)).toEqual([])
  })

  it('flags an active item with no matching materialized occurrence', () => {
    const item = recurring({ id: 'r1', name: '월세' })
    expect(findMissingRecurringOccurrences([item], [], JUN_2026)).toEqual([
      {
        kind: 'missing_recurring',
        label: '고정 항목 "월세"이 이번 달 내역에 반영되지 않았습니다.',
        nav: { month: '2026-06', categoryId: 'food' },
      },
    ])
  })

  it('ignores inactive items and items outside their start/end range', () => {
    const inactive = recurring({ id: 'r1', isActive: false })
    const notStarted = recurring({ id: 'r2', startMonth: '2026-07-01' })
    const ended = recurring({ id: 'r3', endMonth: '2026-05-01' })
    expect(findMissingRecurringOccurrences([inactive, notStarted, ended], [], JUN_2026)).toEqual([])
  })

  it('does not flag an item the caller has pre-filtered out as intentionally skipped', () => {
    // Simulates the tool handler dropping items covered by a recurring_skips row
    // for this month before calling the domain function.
    const item = recurring({ id: 'r1' })
    expect(findMissingRecurringOccurrences([], [], JUN_2026)).toEqual([])
    void item
  })
})

describe('findDuplicateCandidates', () => {
  const names = new Map([['food', '식비']])

  it('groups an exact triple (same date, amount, category, memo)', () => {
    const txns = [
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '점심' }),
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '점심' }),
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '점심' }),
    ]
    const findings = findDuplicateCandidates(txns, names, JUN_2026)
    expect(findings).toHaveLength(1)
    expect(findings[0]).toMatchObject({
      kind: 'duplicate_candidate',
      nav: { month: '2026-06', categoryId: 'food', memoContains: '점심' },
    })
  })

  it('treats null and blank-string memo as the same empty memo', () => {
    const txns = [
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: null }),
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '   ' }),
    ]
    expect(findDuplicateCandidates(txns, names, JUN_2026)).toHaveLength(1)
  })

  // §5.7 widened this finder past the exact date|amount|category|memo key: a
  // next-day re-entry is now reported, labelled 의심 rather than asserted.
  it('groups a next-day repeat and labels it as suspected', () => {
    const txns = [
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '점심' }),
      txn({ txnDate: '2026-06-06', amount: 20_000, memo: '점심' }),
    ]
    const findings = findDuplicateCandidates(txns, names, JUN_2026)
    expect(findings).toHaveLength(1)
    expect(findings[0].label).toContain('2026-06-05~2026-06-06')
    expect(findings[0].label).toContain('의심')
  })

  it('does not group transactions two days apart', () => {
    const txns = [
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '점심' }),
      txn({ txnDate: '2026-06-07', amount: 20_000, memo: '점심' }),
    ]
    expect(findDuplicateCandidates(txns, names, JUN_2026)).toEqual([])
  })

  it('does not narrow navigation by memo when the group is held together by similar memos', () => {
    const txns = [
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '점심' }),
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: null }),
    ]
    const findings = findDuplicateCandidates(txns, names, JUN_2026)
    expect(findings).toHaveLength(1)
    expect(findings[0].nav.memoContains).toBeUndefined()
  })

  it('does not group transactions differing only by amount', () => {
    const txns = [
      txn({ txnDate: '2026-06-05', amount: 20_000, memo: '점심' }),
      txn({ txnDate: '2026-06-05', amount: 21_000, memo: '점심' }),
    ]
    expect(findDuplicateCandidates(txns, names, JUN_2026)).toEqual([])
  })
})

describe('findUnmemoedLargeExpenses', () => {
  const names = new Map([['food', '식비']])

  it('flags only the top 10% of expense amounts, and only when unmemoed', () => {
    // 10 expenses, 1000..10000; nearest-rank 90th percentile = 9000, so the
    // 9000 and 10000 expenses (both >= threshold) are flagged, the rest are not.
    const txns = Array.from({ length: 10 }, (_, i) =>
      txn({ id: `e${i}`, amount: (i + 1) * 1_000, memo: null }),
    )
    const findings = findUnmemoedLargeExpenses(txns, names, JUN_2026)
    expect(findings.map((f) => f.label)).toEqual([
      expect.stringContaining('₩10,000'),
      expect.stringContaining('₩9,000'),
    ])
    expect(findings[0].nav).toMatchObject({ month: '2026-06', categoryId: 'food' })
  })

  it('treats a blank-string memo as empty (still flagged), a non-blank memo as memoed (not flagged)', () => {
    const blank = txn({ amount: 100_000, memo: '   ' })
    const memoed = txn({ amount: 100_000, memo: '병원비' })
    expect(findUnmemoedLargeExpenses([blank], names, JUN_2026)).toHaveLength(1)
    expect(findUnmemoedLargeExpenses([memoed], names, JUN_2026)).toEqual([])
  })

  it('returns nothing when there are no expense transactions', () => {
    expect(findUnmemoedLargeExpenses([], names, JUN_2026)).toEqual([])
  })
})

describe('findBudgetAndGoalFindings', () => {
  const row = (overrides: Partial<AchievementRow>): AchievementRow => ({
    categoryId: 'food',
    name: '식비',
    type: 'expense',
    target: 300_000,
    actual: 0,
    remaining: 300_000,
    pct: 0,
    status: '정상',
    ...overrides,
  })

  it('flags 초과 지출 categories as over_budget', () => {
    const rows = [row({ status: '초과', actual: 350_000, remaining: -50_000 })]
    expect(findBudgetAndGoalFindings(rows, JUN_2026)).toEqual([
      {
        kind: 'over_budget',
        label: '식비 카테고리가 예산을 ₩50,000 초과했습니다.',
        nav: { month: '2026-06', categoryId: 'food' },
      },
    ])
  })

  it('flags 저축 categories that have not reached 달성 as under_saving_goal', () => {
    const rows = [
      row({
        type: 'saving',
        name: '비상금',
        target: 100_000,
        actual: 40_000,
        remaining: 60_000,
        status: '진행중',
      }),
    ]
    expect(findBudgetAndGoalFindings(rows, JUN_2026)).toEqual([
      {
        kind: 'under_saving_goal',
        label: '비상금 저축 목표에 ₩60,000 못 미쳤습니다.',
        nav: { month: '2026-06', categoryId: 'food' },
      },
    ])
  })

  it('does not flag 달성 저축 categories or 정상/주의 지출 categories', () => {
    const rows = [
      row({ status: '정상' }),
      row({ status: '주의' }),
      row({ type: 'saving', status: '달성', target: 100_000, actual: 100_000, remaining: 0 }),
    ]
    expect(findBudgetAndGoalFindings(rows, JUN_2026)).toEqual([])
  })
})

describe('reviewMonth', () => {
  const categories: CategoryLike[] = [
    { id: 'food', name: '식비', type: 'expense', budgetAmount: null, goalAmount: null },
  ]

  it('splits findings into needsCheck and forReference', () => {
    const overBudget: AchievementRow = {
      categoryId: 'food',
      name: '식비',
      type: 'expense',
      target: 100_000,
      actual: 150_000,
      remaining: -50_000,
      pct: 150,
      status: '초과',
    }
    const under: AchievementRow = {
      categoryId: 'save',
      name: '저축',
      type: 'saving',
      target: 100_000,
      actual: 40_000,
      remaining: 60_000,
      pct: 40,
      status: '진행중',
    }
    const result = reviewMonth({
      recurringItems: [],
      txns: [],
      categories,
      achievements: [overBudget, under],
      ym: JUN_2026,
    })
    expect(result.needsCheck.map((f) => f.kind)).toEqual(['over_budget'])
    expect(result.forReference.map((f) => f.kind)).toEqual(['under_saving_goal'])
    expect(result.truncated).toBe(false)
  })

  it('truncates to maxFindingsPerKind and sets truncated', () => {
    const txns = Array.from({ length: 3 }, (_, i) =>
      txn({ id: `d${i}`, txnDate: '2026-06-01', amount: 5_000 + i, memo: null }),
    ).flatMap((t) => [t, { ...t, id: `${t.id}b` }]) // each amount duplicated once -> 3 duplicate_candidate kinds

    const result = reviewMonth({
      recurringItems: [],
      txns,
      categories,
      achievements: [],
      ym: JUN_2026,
      maxFindingsPerKind: 2,
    })
    expect(result.needsCheck).toHaveLength(2)
    expect(result.truncated).toBe(true)
  })
})
