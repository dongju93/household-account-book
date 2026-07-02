import { useWebMCP } from '@mcp-b/react-webmcp'

import { useRefresh } from '../app/useRefresh'
import { useLedger } from '../auth/useLedger'
import { listCategories } from '../data/categories'
import { fetchTransactionsInRange } from '../data/summary'
import {
  type CategoryBreakdownRow,
  categoryExpenseBreakdown,
  type CategoryDeltaRow,
  categoryMonthOverMonthDeltas,
  groupTransactionsByMonth,
  monthlyTrend,
  type MonthlyTrendPoint,
  REPORT_PERIODS,
  type ReportPeriodMonths,
} from '../domain/reports'
import { currentYearMonth, lastMonths, monthRange } from '../lib/month'
import { NOT_READY_REASON, READ_ONLY_ANNOTATIONS, resolveCategoryByName } from './shared'

const PERIOD_INPUT_PROPERTY = {
  type: 'number',
  enum: REPORT_PERIODS,
  description: '조회 기간(개월). 생략 시 통계 화면에서 선택된 기간(초기값 6).',
} as const

const TREND_POINT_SCHEMA = {
  type: 'object',
  properties: {
    month: { type: 'string', description: 'YYYY-MM' },
    totalIncome: { type: 'number' },
    totalExpense: { type: 'number' },
    totalSaving: { type: 'number' },
    totalInvestment: { type: 'number' },
    balance: { type: 'number' },
  },
  required: ['month', 'totalIncome', 'totalExpense', 'totalSaving', 'totalInvestment', 'balance'],
  additionalProperties: false,
} as const

const TOP_CATEGORY_SCHEMA = {
  type: 'object',
  properties: {
    categoryId: { type: 'string' },
    name: { type: 'string' },
    amount: { type: 'number' },
    pct: { type: 'number', description: '기간 전체 지출 대비 비중 (0-100)' },
  },
  required: ['categoryId', 'name', 'amount', 'pct'],
  additionalProperties: false,
} as const

const RISING_CATEGORY_SCHEMA = {
  type: 'object',
  properties: {
    categoryId: { type: 'string' },
    name: { type: 'string' },
    latestAmount: { type: 'number' },
    previousAmount: { type: 'number' },
    delta: { type: 'number', description: '최근 달 지출 - 직전 달 지출 (원)' },
    deltaPct: { type: 'number', description: '직전 달 대비 증감률 (%)' },
  },
  required: ['categoryId', 'name', 'latestAmount', 'previousAmount', 'delta', 'deltaPct'],
  additionalProperties: false,
} as const

const TREND_INPUT_SCHEMA = {
  type: 'object',
  properties: { periodMonths: PERIOD_INPUT_PROPERTY },
  additionalProperties: false,
} as const

const TREND_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    reason: { type: 'string' },
    periodMonths: { type: 'number' },
    months: { type: 'array', items: TREND_POINT_SCHEMA },
    topCategories: { type: 'array', items: TOP_CATEGORY_SCHEMA },
    risingCategories: { type: 'array', items: RISING_CATEGORY_SCHEMA },
  },
  required: ['ready'],
  additionalProperties: false,
} as const

const CATEGORY_DETAIL_INPUT_SCHEMA = {
  type: 'object',
  properties: {
    categoryName: { type: 'string', description: '조회할 카테고리 이름 (예: "식비")' },
    periodMonths: PERIOD_INPUT_PROPERTY,
  },
  required: ['categoryName'],
  additionalProperties: false,
} as const

const CATEGORY_MONTH_SCHEMA = {
  type: 'object',
  properties: {
    month: { type: 'string', description: 'YYYY-MM' },
    amount: { type: 'number' },
  },
  required: ['month', 'amount'],
  additionalProperties: false,
} as const

const CATEGORY_DETAIL_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    reason: { type: 'string' },
    matched: { type: 'boolean' },
    candidates: { type: 'array', items: { type: 'string' } },
    category: {
      type: 'object',
      properties: {
        categoryId: { type: 'string' },
        name: { type: 'string' },
        periodMonths: { type: 'number' },
        months: { type: 'array', items: CATEGORY_MONTH_SCHEMA },
        totalAmount: { type: 'number' },
      },
      required: ['categoryId', 'name', 'periodMonths', 'months', 'totalAmount'],
      additionalProperties: false,
    },
  },
  required: ['ready', 'matched'],
  additionalProperties: false,
} as const

const COMPARE_INPUT_SCHEMA = {
  type: 'object',
  properties: {},
  additionalProperties: false,
} as const

const COMPARE_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    ready: { type: 'boolean' },
    reason: { type: 'string' },
    current: TREND_POINT_SCHEMA,
    previous: TREND_POINT_SCHEMA,
    deltas: {
      type: 'object',
      properties: {
        income: { type: 'number' },
        expense: { type: 'number' },
        saving: { type: 'number' },
        investment: { type: 'number' },
        balance: { type: 'number' },
      },
      required: ['income', 'expense', 'saving', 'investment', 'balance'],
      additionalProperties: false,
    },
  },
  required: ['ready'],
  additionalProperties: false,
} as const

/**
 * Fetch the window's transactions + categories exactly like ReportsPage does
 * (same lastMonths/monthRange arithmetic). Deliberately does NOT materialize —
 * read-only tools must not write rows; the hosting screen already materialized
 * its window before these tools became callable.
 */
async function loadPeriodData(ledgerId: string, periodMonths: number) {
  const months = lastMonths(currentYearMonth(), periodMonths)
  const start = monthRange(months[0].year, months[0].month).start
  const last = months[months.length - 1]
  const endExclusive = monthRange(last.year, last.month).endExclusive
  const [txns, categories] = await Promise.all([
    fetchTransactionsInRange(ledgerId, start, endExclusive),
    listCategories(ledgerId),
  ])
  return { months, txns, categories }
}

interface MonthlyTrendOutput {
  ready: boolean
  reason?: string
  periodMonths?: number
  months?: MonthlyTrendPoint[]
  topCategories?: CategoryBreakdownRow[]
  risingCategories?: CategoryDeltaRow[]
}

async function loadMonthlyTrend(
  ledgerId: string | null,
  periodMonths: number,
): Promise<MonthlyTrendOutput> {
  if (!ledgerId) return { ready: false, reason: NOT_READY_REASON }

  const { months, txns, categories } = await loadPeriodData(ledgerId, periodMonths)
  const byMonth = groupTransactionsByMonth(months, txns)
  return {
    ready: true,
    periodMonths,
    months: monthlyTrend(byMonth),
    topCategories: categoryExpenseBreakdown(categories, txns),
    risingCategories: categoryMonthOverMonthDeltas(categories, byMonth),
  }
}

interface CategoryDetailOutput {
  ready: boolean
  reason?: string
  matched: boolean
  candidates?: string[]
  category?: {
    categoryId: string
    name: string
    periodMonths: number
    months: { month: string; amount: number }[]
    totalAmount: number
  }
}

async function loadCategoryDetail(
  ledgerId: string | null,
  categoryName: string,
  periodMonths: number,
): Promise<CategoryDetailOutput> {
  if (!ledgerId) return { ready: false, reason: NOT_READY_REASON, matched: false }

  const { months, txns, categories } = await loadPeriodData(ledgerId, periodMonths)
  // Match against ALL categories (including inactive), mirroring ReportsPage —
  // an archived category still owns its historical transactions.
  const found = resolveCategoryByName(categories, categoryName)
  if ('candidates' in found) return { ready: true, matched: false, candidates: found.candidates }

  const monthRows = [...groupTransactionsByMonth(months, txns)].map(([month, list]) => ({
    month,
    amount: list.reduce((sum, t) => (t.categoryId === found.match.id ? sum + t.amount : sum), 0),
  }))
  return {
    ready: true,
    matched: true,
    category: {
      categoryId: found.match.id,
      name: found.match.name,
      periodMonths,
      months: monthRows,
      totalAmount: monthRows.reduce((sum, r) => sum + r.amount, 0),
    },
  }
}

interface ComparePeriodsOutput {
  ready: boolean
  reason?: string
  current?: MonthlyTrendPoint
  previous?: MonthlyTrendPoint
  deltas?: { income: number; expense: number; saving: number; investment: number; balance: number }
}

async function loadComparePeriods(ledgerId: string | null): Promise<ComparePeriodsOutput> {
  if (!ledgerId) return { ready: false, reason: NOT_READY_REASON }

  const months = lastMonths(currentYearMonth(), 2)
  const start = monthRange(months[0].year, months[0].month).start
  const endExclusive = monthRange(months[1].year, months[1].month).endExclusive
  const txns = await fetchTransactionsInRange(ledgerId, start, endExclusive)

  // groupTransactionsByMonth seeds both keys, so both points always exist.
  const [previous, current] = monthlyTrend(groupTransactionsByMonth(months, txns))
  return {
    ready: true,
    current,
    previous,
    deltas: {
      income: current.totalIncome - previous.totalIncome,
      expense: current.totalExpense - previous.totalExpense,
      saving: current.totalSaving - previous.totalSaving,
      investment: current.totalInvestment - previous.totalInvestment,
      balance: current.balance - previous.balance,
    },
  }
}

/**
 * Registers the three read-only 질의응답형 통계 WebMCP tools. Mount only inside
 * `ReportsPage`: the tools answer over the same period window the screen shows,
 * so `period` (the selected 3/6/12 chip) doubles as the default when the agent
 * omits `periodMonths` — keeping "data on screen = data the tool answers with".
 */
export function useStatsQnaTools(period: ReportPeriodMonths): void {
  const { ledgerId } = useLedger()
  const { version } = useRefresh()

  useWebMCP(
    {
      name: 'qna_monthly_trend',
      description:
        '최근 N개월(3/6/12)의 월별 수입/지출/저축/투자/수지 추이(months)와, 기간 내 금액이 큰 지출 카테고리(topCategories), 최근 달 기준 전월 대비 지출 증감이 큰 카테고리(risingCategories)를 반환한다.',
      inputSchema: TREND_INPUT_SCHEMA,
      outputSchema: TREND_OUTPUT_SCHEMA,
      annotations: { title: '월별 추이 요약', ...READ_ONLY_ANNOTATIONS },
      handler: (input) => loadMonthlyTrend(ledgerId, input.periodMonths ?? period),
    },
    [ledgerId, period, version],
  )

  useWebMCP(
    {
      name: 'qna_category_detail',
      description:
        '카테고리 이름으로 최근 N개월간 월별 금액 추이와 기간 합계를 조회한다 (예: "요즘 식비 얼마나 쓰고 있어?").',
      inputSchema: CATEGORY_DETAIL_INPUT_SCHEMA,
      outputSchema: CATEGORY_DETAIL_OUTPUT_SCHEMA,
      annotations: { title: '카테고리별 추이 조회', ...READ_ONLY_ANNOTATIONS },
      handler: (input) =>
        loadCategoryDetail(ledgerId, input.categoryName, input.periodMonths ?? period),
    },
    [ledgerId, period, version],
  )

  useWebMCP(
    {
      name: 'qna_compare_periods',
      description:
        '이번 달과 지난달의 수입/지출/저축/투자/수지를 비교해 증감액을 반환한다. 사실(숫자)만 전달하며 평가·판단은 포함하지 않는다.',
      inputSchema: COMPARE_INPUT_SCHEMA,
      outputSchema: COMPARE_OUTPUT_SCHEMA,
      annotations: { title: '이번 달 vs 지난달 비교', ...READ_ONLY_ANNOTATIONS },
      handler: () => loadComparePeriods(ledgerId),
    },
    [ledgerId, version],
  )
}
