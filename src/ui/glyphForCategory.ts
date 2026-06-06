import type { FundType } from '../domain/fundType'

export type GlyphKey =
  | 'food'
  | 'cafe'
  | 'home'
  | 'bus'
  | 'cart'
  | 'health'
  | 'fun'
  | 'pay'
  | 'bank'
  | 'save'
  | 'invest'
  | 'income'
  | 'gift'
  | 'edu'
  | 'etc'

// Heuristic mapping from a Korean category name to a glyph, with a fund-type
// fallback so every category renders something sensible.
const NAME_HINTS: Array<[RegExp, GlyphKey]> = [
  [/식비|밥|음식|외식/, 'food'],
  [/카페|커피/, 'cafe'],
  [/집|월세|주거|관리비/, 'home'],
  [/교통|버스|지하철|택시|차/, 'bus'],
  [/생활|마트|장보기|쇼핑/, 'cart'],
  [/건강|병원|의료|약/, 'health'],
  [/문화|여가|취미|구독/, 'fun'],
  [/공과|통신|요금|구독료/, 'pay'],
  [/교육|학원|책/, 'edu'],
  [/선물|경조/, 'gift'],
  [/비상금|저축|적금|청약/, 'save'],
  [/투자|주식|펀드/, 'invest'],
  [/월급|급여|수입|보너스/, 'income'],
]

const TYPE_FALLBACK: Record<FundType, GlyphKey> = {
  income: 'income',
  expense: 'cart',
  saving: 'save',
  investment: 'invest',
}

export function glyphForCategory(name: string, type: FundType): GlyphKey {
  for (const [re, key] of NAME_HINTS) {
    if (re.test(name)) return key
  }
  return TYPE_FALLBACK[type]
}
