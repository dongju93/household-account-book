import type { FundType } from '../domain/fundType'
import type { RecurringItem } from '../domain/types'
import { supabase } from '../lib/supabase'
import { mapRecurring } from './mappers'

export async function listRecurring(ledgerId: string): Promise<RecurringItem[]> {
  const { data, error } = await supabase
    .from('recurring_items')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data ?? []).map(mapRecurring)
}

export interface RecurringWrite {
  name: string
  type: FundType
  categoryId: string
  amount: number
  startMonth: string // 'YYYY-MM'
  endMonth: string | null // 'YYYY-MM' | null
  dayOfMonth: number
  memo: string | null
}

// recurring_items store month columns as first-of-month dates.
const monthFirst = (ym: string): string => `${ym}-01`

function toRow(ledgerId: string, input: RecurringWrite) {
  return {
    ledger_id: ledgerId,
    category_id: input.categoryId,
    name: input.name,
    type: input.type,
    amount: input.amount,
    start_month: monthFirst(input.startMonth),
    end_month: input.endMonth ? monthFirst(input.endMonth) : null,
    day_of_month: input.dayOfMonth,
    memo: input.memo,
  }
}

export async function createRecurring(ledgerId: string, input: RecurringWrite): Promise<RecurringItem> {
  const { data, error } = await supabase
    .from('recurring_items')
    .insert(toRow(ledgerId, input))
    .select('*')
    .single()
  if (error) throw error
  return mapRecurring(data)
}

export async function updateRecurring(
  id: string,
  ledgerId: string,
  input: RecurringWrite,
): Promise<void> {
  const { ledger_id, ...patch } = toRow(ledgerId, input)
  void ledger_id // ledger_id is immutable; excluded from the patch
  const { error } = await supabase.from('recurring_items').update(patch).eq('id', id)
  if (error) throw error
}

export async function setRecurringActive(id: string, isActive: boolean): Promise<void> {
  const { error } = await supabase
    .from('recurring_items')
    .update({ is_active: isActive })
    .eq('id', id)
  if (error) throw error
}
