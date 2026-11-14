import {
  type CategoryMonthTarget,
  type MonthTargetChoice,
  parseTargetAmount,
} from '../domain/categoryMonthTargets'
import type { Category } from '../domain/types'
import { monthKey, parseMonthKey, type YearMonth } from '../lib/month'
import { supabase } from '../lib/supabase'

function parseTargetRow(raw: unknown): CategoryMonthTarget {
  if (typeof raw !== 'object' || raw === null)
    throw new Error('월별 예산 데이터가 올바르지 않습니다.')
  const row = raw as Record<string, unknown>
  const amount = parseTargetAmount(row.custom_amount)
  if (
    typeof row.category_id !== 'string' ||
    typeof row.month !== 'string' ||
    !/^\d{4}-\d{2}-01$/.test(row.month) ||
    !parseMonthKey(row.month.slice(0, 7)) ||
    (row.source !== 'global' && row.source !== 'custom') ||
    amount === null
  ) {
    throw new Error('월별 예산 데이터가 올바르지 않습니다.')
  }
  return {
    categoryId: row.category_id,
    month: row.month,
    source: row.source,
    customAmount: amount,
  }
}

export async function listCategoryMonthTargets(
  ledgerId: string,
  ym: YearMonth,
): Promise<CategoryMonthTarget[]> {
  const { data, error } = await supabase
    .from('category_month_targets')
    .select('category_id, month, source, custom_amount')
    .eq('ledger_id', ledgerId)
    .eq('month', `${monthKey(ym.year, ym.month)}-01`)
  if (error) throw error
  return (data ?? []).map(parseTargetRow)
}

export async function saveCategoryMonthTarget(
  category: Pick<Category, 'id' | 'ledgerId' | 'type'>,
  ym: YearMonth,
  choice: MonthTargetChoice,
): Promise<void> {
  if (category.type !== 'expense' && category.type !== 'saving') {
    throw new Error('지출·저축 카테고리만 월별 금액을 설정할 수 있습니다.')
  }
  const { error } = await supabase.rpc('set_category_month_target', {
    p_ledger: category.ledgerId,
    p_category: category.id,
    p_month: `${monthKey(ym.year, ym.month)}-01`,
    p_source: choice.source,
    p_custom_amount: choice.source === 'custom' ? choice.amount : null,
  })
  if (error) throw error
}
