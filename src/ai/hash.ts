/**
 * Stable hash for `ai_insight_cache.data_version_hash` (docs/4 §4.8.5).
 * Canonical JSON → SHA-256 hex so key order / whitespace never thrash the cache.
 */

/** Deep-canonicalize then JSON.stringify (object keys sorted; array order kept). */
export function stableStringify(value: unknown): string {
  return JSON.stringify(canonicalize(value))
}

function canonicalize(value: unknown): unknown {
  if (value === null || typeof value !== 'object') {
    return value
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize)
  }
  const obj = value as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(obj).sort()) {
    out[key] = canonicalize(obj[key])
  }
  return out
}

/**
 * SHA-256 hex of the stable JSON form of `payload`.
 * Use the same aggregate object later sent as `input` for cacheable features.
 */
export async function dataVersionHash(payload: unknown): Promise<string> {
  const text = stableStringify(payload)
  const bytes = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', bytes)
  return hexFromBuffer(digest)
}

function hexFromBuffer(buf: ArrayBuffer): string {
  const view = new Uint8Array(buf)
  let hex = ''
  for (let i = 0; i < view.length; i++) {
    hex += view[i]!.toString(16).padStart(2, '0')
  }
  return hex
}
