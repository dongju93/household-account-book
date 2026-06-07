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
  | 'clothes'
  | 'travel'
  | 'fitness'
  | 'phone'
  | 'pet'
  | 'beauty'
  | 'car'
  | 'music'
  | 'game'
  | 'etc'

export const ALL_GLYPH_KEYS: GlyphKey[] = [
  'food',
  'cafe',
  'home',
  'bus',
  'cart',
  'health',
  'fun',
  'pay',
  'bank',
  'save',
  'invest',
  'income',
  'gift',
  'edu',
  'clothes',
  'travel',
  'fitness',
  'phone',
  'pet',
  'beauty',
  'car',
  'music',
  'game',
  'etc',
]

export const GLYPH_LABELS: Record<GlyphKey, string> = {
  food: '식비',
  cafe: '카페',
  home: '주거',
  bus: '교통',
  cart: '쇼핑',
  health: '건강',
  fun: '여가',
  pay: '요금',
  bank: '은행',
  save: '저축',
  invest: '투자',
  income: '수입',
  gift: '선물',
  edu: '교육',
  clothes: '의류',
  travel: '여행',
  fitness: '운동',
  phone: '휴대폰',
  pet: '반려동물',
  beauty: '미용',
  car: '자동차',
  music: '음악',
  game: '게임',
  etc: '기타',
}

// Heuristic mapping from a Korean category name to a glyph, with a fund-type
// fallback so every category renders something sensible.
const NAME_HINTS: Array<[RegExp, GlyphKey]> = [
  [/식비|밥|음식|외식/, 'food'],
  [/카페|커피/, 'cafe'],
  [/집|월세|주거|관리비/, 'home'],
  [/교통|버스|지하철|택시/, 'bus'],
  [/생활|마트|장보기|쇼핑/, 'cart'],
  [/건강|병원|의료|약/, 'health'],
  [/문화|여가|취미/, 'fun'],
  [/공과|통신|요금|구독/, 'pay'],
  [/교육|학원|책/, 'edu'],
  [/선물|경조/, 'gift'],
  [/비상금|저축|적금|청약/, 'save'],
  [/투자|주식|펀드/, 'invest'],
  [/월급|급여|수입|보너스/, 'income'],
  [/옷|의류|패션|쇼핑/, 'clothes'],
  [/여행|숙박|항공/, 'travel'],
  [/운동|헬스|피트니스|스포츠/, 'fitness'],
  [/휴대폰|통신|핸드폰|인터넷/, 'phone'],
  [/반려|애완|강아지|고양이/, 'pet'],
  [/미용|뷰티|화장|헤어/, 'beauty'],
  [/자동차|주유|차량|차/, 'car'],
  [/음악|스트리밍|멜론|스포티파이/, 'music'],
  [/게임|넷플릭스|구독료/, 'game'],
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
