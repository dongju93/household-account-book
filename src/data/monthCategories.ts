import { applyCategoryMonthTargets } from '../domain/categoryMonthTargets'
import type { YearMonth } from '../lib/month'
import { listCategories } from './categories'
import { listCategoryMonthTargets } from './categoryMonthTargets'

/** All consumers of monthly targets share the same resolution boundary. */
export async function loadCategoriesForMonth(
  ledgerId: string,
  ym: YearMonth,
  options: { activeOnly?: boolean } = {},
) {
  const [globalCategories, targets] = await Promise.all([
    listCategories(ledgerId, options),
    listCategoryMonthTargets(ledgerId, ym),
  ])
  return {
    globalCategories,
    targets,
    categories: applyCategoryMonthTargets(globalCategories, targets, ym),
  }
}
