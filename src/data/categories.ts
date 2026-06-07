import type { FundType } from '../domain/fundType'
import type { Category } from '../domain/types'
import { supabase } from '../lib/supabase'
import type { GlyphKey } from '../ui/glyphForCategory'
import { mapCategory } from './mappers'

export async function listCategories(
  ledgerId: string,
  opts: { activeOnly?: boolean } = {},
): Promise<Category[]> {
  let query = supabase
    .from('categories')
    .select('*')
    .eq('ledger_id', ledgerId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (opts.activeOnly) query = query.eq('is_active', true)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(mapCategory)
}

export interface CategoryWrite {
  name: string
  type: FundType
  icon: GlyphKey | null
  budgetAmount: number | null
  goalAmount: number | null
  sortOrder?: number
}

export async function createCategory(ledgerId: string, input: CategoryWrite): Promise<Category> {
  const { data, error } = await supabase
    .from('categories')
    .insert({
      ledger_id: ledgerId,
      name: input.name,
      type: input.type,
      icon: input.icon,
      budget_amount: input.budgetAmount,
      goal_amount: input.goalAmount,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single()
  if (error) throw error
  return mapCategory(data)
}

export interface CategoryPatch {
  name?: string
  icon?: GlyphKey | null
  budgetAmount?: number | null
  goalAmount?: number | null
  sortOrder?: number
  isActive?: boolean
}

export async function updateCategory(id: string, patch: CategoryPatch): Promise<void> {
  // Note: `type` is intentionally not patchable here — changing a category's
  // 구분 would break existing transactions, so the UI blocks it (spec §7.1).
  const row: Record<string, unknown> = {}
  if (patch.name !== undefined) row.name = patch.name
  if (patch.icon !== undefined) row.icon = patch.icon
  if (patch.budgetAmount !== undefined) row.budget_amount = patch.budgetAmount
  if (patch.goalAmount !== undefined) row.goal_amount = patch.goalAmount
  if (patch.sortOrder !== undefined) row.sort_order = patch.sortOrder
  if (patch.isActive !== undefined) row.is_active = patch.isActive

  const { error } = await supabase.from('categories').update(row).eq('id', id)
  if (error) throw error
}

export async function setCategoryActive(id: string, isActive: boolean): Promise<void> {
  await updateCategory(id, { isActive })
}

/** Persist a new ordering; sort_order becomes the array index. */
export async function reorderCategories(orderedIds: string[]): Promise<void> {
  const results = await Promise.all(
    orderedIds.map((id, index) =>
      supabase.from('categories').update({ sort_order: index }).eq('id', id),
    ),
  )
  const failed = results.find((r) => r.error)
  if (failed?.error) throw failed.error
}
