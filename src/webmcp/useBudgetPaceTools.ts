import { useWebMCP } from '@mcp-b/react-webmcp'

import { useRefresh } from '../app/useRefresh'
import { useLedger } from '../auth/useLedger'
import { listCategories } from '../data/categories'
import { fetchTransactionsInRange } from '../data/summary'
import {
  type BudgetPaceRowWithStatus,
  budgetPaceRowsWithStatus,
  computeBudgetPaceRows,
} from '../domain/budgetPace'
import { computeMonthSummary, type MonthSummary } from '../domain/monthSummary'
import {
  currentYearMonth,
  monthKey,
  monthRange,
  parseMonthKey,
  todayISO,
  type YearMonth,
} from '../lib/month'

const MONTH_INPUT_PROPERTY = {
  type: 'string',
  pattern: '^[0-9]{4}-[0-9]{2}$',
  description: '조회할 월 (YYYY-MM). 생략 시 이번 달.',
} as const

const SUMMARY_SCHEMA = {
  type: 'object',
  properties: {
    totalIncome: { type: 'number' },
    totalExpense: { type: 'number' },
    totalSaving: { type: 'number' },
    totalInvestment: { type: 'number' },
    balance: { type: 'number' },
  },
  required: ['totalIncome', 'totalExpense', 'totalSaving', 'totalInvestment', 'balance'],
  additionalProperties: false,
} as const

const PACE_CATEGORY_SCHEMA = {
  type: 'object',
  properties: {
    categoryId: { type: 'string' },
    name: { type: 'string' },
    budget: { type: 'number' },
    actual: { type: 'number' },
    remainingBudget: { type: 'number' },
    daysRemaining: { type: 'number' },
    dailyAllowance: { type: 'number' },
    status: { type: 'string', enum: ['초과', '주의', '정상'] },
  },
  required: [
    'categoryId',
    'name',
    'budget',
    'actual',
    'remainingBudget',
    'daysRemaining',
    'dailyAllowance',
    'status',
  ],
  additionalProperties: false,
} as const

const OVERVIEW_INPUT_SCHEMA = {
  type: 'object',
  properties: { month: MONTH_INPUT_PROPERTY },
  additionalProperties: false,
} as const

const OVERVIEW_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    reason: { type: 'string' },
    month: { type: 'string' },
    summary: SUMMARY_SCHEMA,
    categories: { type: 'array', items: PACE_CATEGORY_SCHEMA },
    note: { type: 'string' },
  },
  required: ['ready'],
  additionalProperties: false,
} as const

const CATEGORY_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    categoryName: { type: 'string', description: '조회할 지출 카테고리 이름 (예: "식비")' },
    month: MONTH_INPUT_PROPERTY,
  },
  required: ['categoryName'],
  additionalProperties: false,
} as const

const CATEGORY_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    reason: { type: 'string' },
    matched: { type: 'boolean' },
    candidates: { type: 'array', items: { type: 'string' } },
    category: PACE_CATEGORY_SCHEMA,
    note: { type: 'string' },
  },
  additionalProperties: false,
  required: ['ready', 'matched'],
} as const

const READ_ONLY_ANNOTATIONS = { readOnlyHint: true, idempotentHint: true } as const

const NOT_READY_REASON = '가계부 정보를 아직 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.'
const INVALID_MONTH_REASON = 'month 형식이 올바르지 않습니다 (YYYY-MM).'
const PAST_MONTH_NOTE = '과거 월은 예산 페이스를 제공하지 않습니다.'

function resolveMonth(monthInput: string | undefined): { ym: YearMonth } | { error: string } {
  if (!monthInput) return { ym: currentYearMonth() }
  const ym = parseMonthKey(monthInput)
  return ym ? { ym } : { error: INVALID_MONTH_REASON }
}

interface OverviewOutput {
  ready: boolean
  reason?: string
  month?: string
  summary?: MonthSummary
  categories?: BudgetPaceRowWithStatus[]
  note?: string
}

async function loadOverview(
  ledgerId: string | null,
  monthInput: string | undefined,
): Promise<OverviewOutput> {
  if (!ledgerId) return { ready: false, reason: NOT_READY_REASON }

  const resolved = resolveMonth(monthInput)
  if ('error' in resolved) return { ready: false, reason: resolved.error }
  const { ym } = resolved

  const range = monthRange(ym.year, ym.month)
  const [txns, categories] = await Promise.all([
    fetchTransactionsInRange(ledgerId, range.start, range.endExclusive),
    listCategories(ledgerId, { activeOnly: true }),
  ])

  const month = monthKey(ym.year, ym.month)
  const summary = computeMonthSummary(txns)
  const now = currentYearMonth()
  if (ym.year !== now.year || ym.month !== now.month) {
    return { ready: true, month, summary, note: PAST_MONTH_NOTE }
  }

  const categoryRows = budgetPaceRowsWithStatus(
    computeBudgetPaceRows(categories, txns, ym, todayISO()),
    ym,
  )
  return { ready: true, month, summary, categories: categoryRows }
}

interface CategoryOutput {
  ready: boolean
  reason?: string
  matched: boolean
  candidates?: string[]
  category?: BudgetPaceRowWithStatus
  note?: string
}

async function loadCategory(
  ledgerId: string | null,
  categoryName: string,
  monthInput: string | undefined,
): Promise<CategoryOutput> {
  if (!ledgerId) return { ready: false, reason: NOT_READY_REASON, matched: false }

  const resolved = resolveMonth(monthInput)
  if ('error' in resolved) return { ready: false, reason: resolved.error, matched: false }
  const { ym } = resolved

  const now = currentYearMonth()
  if (ym.year !== now.year || ym.month !== now.month) {
    return { ready: true, matched: false, note: PAST_MONTH_NOTE }
  }

  const range = monthRange(ym.year, ym.month)
  const [txns, categories] = await Promise.all([
    fetchTransactionsInRange(ledgerId, range.start, range.endExclusive),
    listCategories(ledgerId, { activeOnly: true }),
  ])

  const rows = budgetPaceRowsWithStatus(computeBudgetPaceRows(categories, txns, ym, todayISO()), ym)
  const trimmed = categoryName.trim()
  const matches = rows.filter((r) => r.name.includes(trimmed))

  if (matches.length !== 1) {
    return { ready: true, matched: false, candidates: matches.map((r) => r.name) }
  }
  return { ready: true, matched: true, category: matches[0] }
}

/**
 * Registers the two read-only budget-pace WebMCP tools for the dashboard
 * screen. Mount only where `useLedger()` already resolves a ledger (i.e.
 * inside `DashboardPage`), so tool availability tracks screen availability
 * with no separate auth check.
 */
export function useBudgetPaceTools(): void {
  const { ledgerId } = useLedger()
  const { version } = useRefresh()

  useWebMCP(
    {
      name: 'budget_pace_overview',
      description:
        '이번 달(또는 지정한 달)의 수입/지출/저축/투자/수지 요약과, 예산 페이스가 켜진 지출 카테고리별 예산·지출·남은 예산·남은 일수·하루 허용액·상태(초과/주의/정상)를 반환한다. 위험도가 높은 카테고리부터 정렬한다.',
      inputSchema: OVERVIEW_INPUT_SCHEMA,
      outputSchema: OVERVIEW_OUTPUT_SCHEMA,
      annotations: { title: '이번 달 예산 페이스 요약', ...READ_ONLY_ANNOTATIONS },
      handler: (input) => loadOverview(ledgerId, input.month),
    },
    [ledgerId, version],
  )

  useWebMCP(
    {
      name: 'budget_pace_category',
      description: '카테고리 이름으로 예산 페이스를 조회한다 (예: "식비 하루 얼마 쓸 수 있어?").',
      inputSchema: CATEGORY_INPUT_SCHEMA,
      outputSchema: CATEGORY_OUTPUT_SCHEMA,
      annotations: { title: '카테고리별 예산 페이스 조회', ...READ_ONLY_ANNOTATIONS },
      handler: (input) => loadCategory(ledgerId, input.categoryName, input.month),
    },
    [ledgerId, version],
  )
}
