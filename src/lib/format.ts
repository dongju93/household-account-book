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
