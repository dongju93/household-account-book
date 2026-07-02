import { useWebMCP } from '@mcp-b/react-webmcp'

import { useLedger } from '../auth/useLedger'
import { listCategories } from '../data/categories'
import { listRecurring, listSkippedRecurringIds } from '../data/recurring'
import { fetchTransactionsInRange, materializeMonth } from '../data/summary'
import { computeAchievements } from '../domain/achievement'
import { type MonthCloseFinding, reviewMonth } from '../domain/monthClose'
import {
  addMonths,
  currentYearMonth,
  monthKey,
  monthRange,
  parseMonthKey,
  type YearMonth,
} from '../lib/month'
import { NOT_READY_REASON } from './shared'

const MONTH_INPUT_PROPERTY = {
  type: 'string',
  pattern: '^[0-9]{4}-[0-9]{2}$',
  description:
    '점검할 달 (YYYY-MM). 생략 시 지난달 — budget_pace_*/qna_* 도구와 달리 기본값이 이번 달이 아니다(월 마감 점검은 보통 새 달이 시작된 직후 지난달을 돌아보는 용도).',
} as const

const FINDING_SCHEMA = {
  type: 'object',
  properties: {
    kind: {
      type: 'string',
      enum: [
        'missing_recurring',
        'duplicate_candidate',
        'unmemoed_large_expense',
        'over_budget',
        'under_saving_goal',
      ],
    },
    label: { type: 'string', description: '한 줄 설명 (한국어, 평가/비난 표현 없음)' },
    nav: {
      type: 'object',
      properties: {
        month: { type: 'string', description: 'YYYY-MM' },
        categoryId: { type: 'string' },
        memoContains: { type: 'string' },
      },
      required: ['month'],
      additionalProperties: false,
    },
  },
  required: ['kind', 'label', 'nav'],
  additionalProperties: false,
} as const

const INPUT_SCHEMA = {
  type: 'object',
  properties: { month: MONTH_INPUT_PROPERTY },
  additionalProperties: false,
} as const

const OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    reason: { type: 'string' },
    month: { type: 'string' },
    needsCheck: { type: 'array', items: FINDING_SCHEMA },
    forReference: { type: 'array', items: FINDING_SCHEMA },
    noIssueSummary: {
      type: 'object',
      properties: {
        categoriesChecked: { type: 'number' },
        transactionsChecked: { type: 'number' },
      },
      required: ['categoriesChecked', 'transactionsChecked'],
      additionalProperties: false,
    },
    truncated: {
      type: 'boolean',
      description: '종류별 상한(기본 10건)에 걸려 일부 후보가 잘렸으면 true.',
    },
  },
  required: ['ready'],
  additionalProperties: false,
} as const

const INVALID_MONTH_REASON = 'month 형식이 올바르지 않습니다 (YYYY-MM).'

/**
 * Unlike every other tool in `src/webmcp/`, this one is NOT read-only: its
 * handler calls `materializeMonth`, which can insert rows into `transactions`
 * (see `loadMonthCloseReview` below). Do not spread the shared
 * `READ_ONLY_ANNOTATIONS` here — `readOnlyHint: true` is a signal MCP clients
 * use to decide whether a tool call needs user confirmation, and claiming it
 * for a tool that writes would let an agent silently materialize recurring
 * transactions for a month the user never asked to open. `idempotentHint`
 * still holds: `materialize_recurring` no-ops via a unique index on repeat
 * calls for the same month.
 */
const MONTH_CLOSE_ANNOTATIONS = { readOnlyHint: false, idempotentHint: true } as const

function resolveReviewMonth(monthInput: string | undefined): { ym: YearMonth } | { error: string } {
  if (!monthInput) return { ym: addMonths(currentYearMonth(), -1) }
  const ym = parseMonthKey(monthInput)
  return ym ? { ym } : { error: INVALID_MONTH_REASON }
}

interface MonthCloseOutput {
  ready: boolean
  reason?: string
  month?: string
  needsCheck?: MonthCloseFinding[]
  forReference?: MonthCloseFinding[]
  noIssueSummary?: { categoriesChecked: number; transactionsChecked: number }
  truncated?: boolean
}

/**
 * Fetches everything `reviewMonth` needs for `ym` and runs it. Unlike the
 * screen-mounted budget_pace and qna tools, this tool is not backed by any
 * screen's already-loaded data (see docs/3. ai-plan-month-close-review.md §1)
 * — it materializes and fetches for itself on every call.
 */
async function loadMonthCloseReview(
  ledgerId: string | null,
  monthInput: string | undefined,
): Promise<MonthCloseOutput> {
  if (!ledgerId) return { ready: false, reason: NOT_READY_REASON }

  const resolved = resolveReviewMonth(monthInput)
  if ('error' in resolved) return { ready: false, reason: resolved.error }
  const { ym } = resolved

  await materializeMonth(ledgerId, ym)

  const range = monthRange(ym.year, ym.month)
  const [recurringItems, categories, txns, skippedRecurringIds] = await Promise.all([
    listRecurring(ledgerId),
    listCategories(ledgerId),
    fetchTransactionsInRange(ledgerId, range.start, range.endExclusive),
    listSkippedRecurringIds(ledgerId, ym),
  ])

  // Items intentionally skipped for `ym` were never supposed to materialize —
  // dropping them here keeps `findMissingRecurringOccurrences` from ever
  // reading a deliberate skip as a materialization bug.
  const eligibleRecurring = recurringItems.filter((r) => !skippedRecurringIds.has(r.id))
  const activeCategories = categories.filter((c) => c.isActive)
  const achievements = computeAchievements(activeCategories, txns).filter(
    (r) => r.target > 0 || r.actual > 0,
  )

  const { needsCheck, forReference, truncated } = reviewMonth({
    recurringItems: eligibleRecurring,
    txns,
    categories,
    achievements,
    ym,
  })

  return {
    ready: true,
    month: monthKey(ym.year, ym.month),
    needsCheck,
    forReference,
    noIssueSummary: {
      categoriesChecked: activeCategories.length,
      transactionsChecked: txns.length,
    },
    truncated,
  }
}

/**
 * Registers the single month-close-review WebMCP tool. Mounted in
 * `AppLayout` (once `ledgerId` is resolved) rather than any one screen — it
 * fetches on demand for whatever month is asked, so no screen's render cycle
 * needs to be the one loading its data. Not read-only, see
 * `MONTH_CLOSE_ANNOTATIONS` above.
 */
export function useMonthCloseTools(): void {
  const { ledgerId } = useLedger()

  useWebMCP(
    {
      name: 'month_close_review',
      description:
        '지정한 달(기본: 지난달)의 마감 점검 결과를 확인 필요(needsCheck) / 참고(forReference)로 분류해 반환한다. "이상 없음" 항목은 개수만 요약한다(noIssueSummary). 각 항목의 nav에 월·카테고리·메모 검색 힌트를 포함해, 거래 내역 화면에서 바로 찾아볼 수 있게 한다.',
      inputSchema: INPUT_SCHEMA,
      outputSchema: OUTPUT_SCHEMA,
      annotations: { title: '월 마감 점검', ...MONTH_CLOSE_ANNOTATIONS },
      handler: (input) => loadMonthCloseReview(ledgerId, input.month),
    },
    [ledgerId],
  )
}
