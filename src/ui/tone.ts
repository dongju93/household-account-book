/*
  Tone tokens (docs/5. frontend-redesign-plan.md §4.1).

  The redesign splits what used to be one blended scale into two that must never
  borrow from each other:

  - `FundTone`   — 수입/지출/저축/투자 data. Charts, fund markers, share bars.
  - `StatusTone` — 오류/주의/정상/정보 UI state. Pills, banners, validation.

  Before the split, 지출 and 위험 shared `danger` and 저축 and 정상 shared `ok`,
  so a red bar in the summary strip and a red "초과" pill meant different things
  in the same colour. Keeping the vocabularies apart is what makes the colour
  legible; `statusTone()` and `fundTone()` are the only sanctioned ways to derive
  one, so a status value can never land in a fund slot by accident.
*/

export type FundTone = 'income' | 'expense' | 'saving' | 'investment'
export type StatusTone = 'danger' | 'warning' | 'success' | 'info'
/** Chrome tones: default emphasis and inert filler. Belong to neither scale. */
export type NeutralTone = 'ink' | 'neutral'

export type Tone = FundTone | StatusTone | NeutralTone

export const toneText: Record<Tone, string> = {
  income: 'text-fund-income',
  expense: 'text-fund-expense',
  saving: 'text-fund-saving',
  investment: 'text-fund-investment',
  danger: 'text-status-danger',
  warning: 'text-status-warning',
  success: 'text-status-success',
  info: 'text-status-info',
  ink: 'text-ink',
  neutral: 'text-ink2',
}

export const toneBg: Record<Tone, string> = {
  income: 'bg-fund-income',
  expense: 'bg-fund-expense',
  saving: 'bg-fund-saving',
  investment: 'bg-fund-investment',
  danger: 'bg-status-danger',
  warning: 'bg-status-warning',
  success: 'bg-status-success',
  info: 'bg-status-info',
  ink: 'bg-ink',
  neutral: 'bg-fill3',
}

/**
 * Tinted background + matching text for pills and inline notices. §4.1 requires
 * status meaning to be carried by background *and* text (plus a label), never by
 * hue alone, which is why these two always ship together.
 */
export const toneTint: Record<Tone, string> = {
  income: 'bg-fund-income/12 text-fund-income',
  expense: 'bg-fund-expense/12 text-fund-expense',
  saving: 'bg-fund-saving/12 text-fund-saving',
  investment: 'bg-fund-investment/12 text-fund-investment',
  danger: 'bg-status-danger/12 text-status-danger',
  warning: 'bg-status-warning/12 text-status-warning',
  success: 'bg-status-success/12 text-status-success',
  info: 'bg-status-info/12 text-status-info',
  ink: 'bg-ink/8 text-ink2',
  neutral: 'bg-fill2 text-ink2',
}

/** Hex values for Recharts — SVG fills cannot take Tailwind classes. */
export const toneHex: Record<Tone, string> = {
  income: '#596d73',
  expense: '#9b6b5d',
  saving: '#6e7d66',
  investment: '#6c7488',
  danger: '#b25147',
  warning: '#8a6a2f',
  success: '#4f765b',
  info: '#536f91',
  ink: '#27251f',
  neutral: '#d8d2c7',
}

/** Chrome hexes charts need for axes, grid and cursors. */
export const chartInkHex = {
  tick: '#8a8479',
  label: '#6f6a60',
  grid: '#eae5dc',
  rule: '#ded8ce',
  surface: '#fffdf9',
} as const
