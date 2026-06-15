function normalizeInteger(raw: unknown, opts: { min: number }): number | null {
  let n: number
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null
    n = Math.trunc(raw)
  } else if (typeof raw === 'string') {
    const cleaned = raw.replace(/[,\s₩]/g, '')
    if (cleaned === '' || !/^-?\d+(\.\d+)?$/.test(cleaned)) return null
    n = Math.trunc(Number(cleaned))
  } else {
    return null
  }
  if (!Number.isFinite(n) || n < opts.min) return null
  return n
}

/** Transaction/recurring amount: strip grouping, truncate to integer, must be > 0. */
export function normalizeAmount(raw: unknown): number | null {
  return normalizeInteger(raw, { min: 1 })
}

/** Budget/goal amount: same normalization but 0 is allowed (unset/no target). */
export function normalizeNonNegative(raw: unknown): number | null {
  return normalizeInteger(raw, { min: 0 })
}
