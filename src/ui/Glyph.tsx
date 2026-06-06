import type { ReactNode } from 'react'
import type { FundType } from '../domain/fundType'

// Geometric category glyphs ported from the wireframe kit (squares/circles/lines).
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

const PATHS: Record<GlyphKey, ReactNode> = {
  food: (
    <g>
      <circle cx="10" cy="10" r="6" />
      <path d="M10 6v8" />
    </g>
  ),
  cafe: (
    <g>
      <rect x="4" y="6" width="9" height="8" rx="2" />
      <path d="M13 8h2.5a1.5 1.5 0 010 3H13" />
    </g>
  ),
  home: <path d="M4 9l6-5 6 5v6H4z" />,
  bus: (
    <g>
      <rect x="4" y="4" width="12" height="9" rx="2" />
      <path d="M4 10h12M6 16v-2M14 16v-2" />
    </g>
  ),
  cart: (
    <g>
      <circle cx="8" cy="15" r="1.3" />
      <circle cx="14" cy="15" r="1.3" />
      <path d="M3 4h2l2 8h8" />
    </g>
  ),
  health: <path d="M10 5v10M5 10h10" />,
  fun: <circle cx="10" cy="10" r="6" />,
  pay: (
    <g>
      <rect x="3" y="6" width="14" height="9" rx="2" />
      <path d="M3 9h14" />
    </g>
  ),
  bank: <path d="M4 8l6-4 6 4M5 8v6M15 8v6M4 15h12" />,
  save: (
    <g>
      <rect x="4" y="6" width="12" height="9" rx="2" />
      <circle cx="10" cy="10.5" r="2" />
    </g>
  ),
  invest: <path d="M4 13l4-4 3 2 5-6" />,
  income: <path d="M10 16V5M6 9l4-4 4 4" />,
  gift: (
    <g>
      <rect x="4" y="8" width="12" height="7" rx="1" />
      <path d="M4 8h12M10 8v7M7 8a2 2 0 110-4c2 0 3 4 3 4" />
    </g>
  ),
  edu: <path d="M3 7l7-3 7 3-7 3z M6 9v4c0 1 8 1 8 0V9" />,
  etc: (
    <g fill="currentColor" stroke="none">
      <circle cx="5" cy="10" r="1.3" />
      <circle cx="10" cy="10" r="1.3" />
      <circle cx="15" cy="10" r="1.3" />
    </g>
  ),
}

export function Glyph({ name, size = 19 }: { name: GlyphKey; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  )
}

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
