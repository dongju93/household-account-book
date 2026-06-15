const KRW = new Intl.NumberFormat('ko-KR')

/** Thousands-grouped number, e.g. 1234567 -> "1,234,567". */
export function formatNumber(n: number): string {
  return KRW.format(n)
}

/**
 * Money label matching the wireframe `Won`: "₩9,000", "-₩42,500", or with a
 * leading "+" for positive values when `withSign` is set (e.g. balance/income).
 */
export function won(n: number, withSign = false): string {
  const abs = KRW.format(Math.abs(n))
  if (n < 0) return `-₩${abs}`
  if (withSign && n > 0) return `+₩${abs}`
  return `₩${abs}`
}

/** Compact axis labels for chart Y-axes, e.g. 1_250_000 -> "125만". */
export function compactWon(n: number): string {
  const sign = n < 0 ? '-' : ''
  const abs = Math.abs(n)
  if (abs >= 100_000_000) {
    const v = abs / 100_000_000
    return `${sign}${Number.isInteger(v) ? v : v.toFixed(1)}억`
  }
  if (abs >= 10_000) return `${sign}${Math.round(abs / 10_000)}만`
  return won(n)
}
