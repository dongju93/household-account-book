/**
 * Client-side safety net for month-insight bullets: strip leaked English field
 * ids and reformat bare KRW amounts the model sometimes echoes from JSON.
 * Does not invent facts — only presentation cleanup after the Edge prompt.
 */

/** English JSON keys / camelCase ids that must never reach the user. */
const FIELD_LABELS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\bremainingBudget\b/g, '잔여 예산'],
  [/\bdailyAllowance\b/g, '하루 허용액'],
  [/\bdaysRemaining\b/g, '남은 일수'],
  [/\btotalInvestment\b/g, '총투자'],
  [/\btotalExpense\b/g, '총지출'],
  [/\btotalIncome\b/g, '총수입'],
  [/\btotalSaving\b/g, '총저축'],
  [/\btopExpenses\b/g, '상위 지출'],
  [/\bachievements\b/g, '예산 목표'],
  [/\bgroundedMonth\b/g, '대상 월'],
  [/\bbalance\b/g, '수지'],
  [/\btarget\b/g, '목표'],
  [/\bactual\b/g, '실적'],
  [/\bsummary\b/g, '요약'],
  [/\bstatus\b/g, '상태'],
  [/\bpace\b/g, '페이스'],
]

function groupDigits(digits: string): string {
  return Number(digits).toLocaleString('en-US')
}

/**
 * Polish one insight bullet for display. Pure, idempotent on already-good text.
 *
 * Number reformatting is conservative: only amounts marked with 원 or ₩, so
 * day counts / years / percents are never rewritten.
 */
export function polishInsightBullet(text: string): string {
  let out = text
  for (const [re, label] of FIELD_LABELS) {
    out = out.replace(re, label)
  }

  // 460100원 / -10100원 / 0원  →  ₩460,100 / -₩10,100 / ₩0
  out = out.replace(/(-?)(\d+)원/g, (_, sign: string, digits: string) => {
    if (digits.includes(',')) return `${sign}₩${digits}`
    const grouped = groupDigits(digits)
    return sign === '-' ? `-₩${grouped}` : `₩${grouped}`
  })

  // ₩460100 / ₩-10100 / -₩10100  →  ₩460,100 / -₩10,100
  // Lookahead is digit-only so a trailing list comma ("₩-10100, …") still matches.
  out = out.replace(/-?₩-?(\d{4,})(?!\d)/g, (full, digits: string) => {
    if (digits.includes(',')) return full
    const grouped = groupDigits(digits)
    return full.includes('-') ? `-₩${grouped}` : `₩${grouped}`
  })

  return out
}

export function polishInsightBullets(bullets: readonly string[]): string[] {
  return bullets.map(polishInsightBullet)
}
