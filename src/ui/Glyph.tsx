import type { ReactNode } from 'react'

import type { GlyphKey } from './glyphForCategory'

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
  clothes: (
    <g>
      <path d="M6 4l-3 3.5 3.5 1.5V16h7V9l3.5-1.5L14 4" />
      <path d="M6 4q4 2.5 8 0" />
    </g>
  ),
  travel: (
    <g>
      <rect x="5" y="7" width="10" height="8" rx="1.5" />
      <path d="M7 7V5.5A1.5 1.5 0 0110 5.5V7M10 7V5.5A1.5 1.5 0 0113 5.5V7" />
      <path d="M5 11h10" />
    </g>
  ),
  fitness: (
    <g>
      <path d="M6 10h8" />
      <rect x="3.5" y="8" width="2.5" height="4" rx="0.8" />
      <rect x="14" y="8" width="2.5" height="4" rx="0.8" />
      <rect x="2" y="9" width="2" height="2" rx="0.5" />
      <rect x="16" y="9" width="2" height="2" rx="0.5" />
    </g>
  ),
  phone: (
    <g>
      <rect x="6" y="2" width="8" height="16" rx="2" />
      <path d="M9 14.5h2" />
    </g>
  ),
  pet: (
    <g fill="currentColor" stroke="none">
      <ellipse cx="10" cy="12.5" rx="3.5" ry="3" />
      <circle cx="6.5" cy="8" r="1.5" />
      <circle cx="13.5" cy="8" r="1.5" />
      <circle cx="8.5" cy="6" r="1.2" />
      <circle cx="11.5" cy="6" r="1.2" />
    </g>
  ),
  beauty: (
    <g>
      <circle cx="10" cy="8" r="3.5" />
      <path d="M10 11.5v4.5" />
      <path d="M7.5 16h5" />
    </g>
  ),
  car: (
    <g>
      <rect x="2" y="9" width="16" height="6" rx="1.5" />
      <path d="M4 9l2-4h8l2 4" />
      <circle cx="6.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="13.5" cy="15.5" r="1.5" fill="currentColor" stroke="none" />
    </g>
  ),
  music: (
    <g>
      <path d="M10 15V7l5-1.5v5" />
      <circle cx="8.5" cy="15" r="2" />
      <circle cx="13.5" cy="10.5" r="2" />
    </g>
  ),
  game: (
    <g>
      <rect x="3" y="7" width="14" height="9" rx="3" />
      <path d="M8 11.5v-2M7 10.5h2" />
      <circle cx="12.5" cy="10" r="0.9" fill="currentColor" stroke="none" />
      <circle cx="14" cy="12" r="0.9" fill="currentColor" stroke="none" />
    </g>
  ),
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
