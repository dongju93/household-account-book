import { describe, expect, it } from 'vitest'

import { appendUserTurn, type ChatMessage } from './chatTurn'

const LIMITS = { messagesMax: 12, contentMax: 500 }

function turns(count: number): ChatMessage[] {
  return Array.from({ length: count }, (_, i) => ({
    role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
    content: `m${i}`,
  }))
}

describe('appendUserTurn', () => {
  it('appends a trimmed user message to the history', () => {
    const r = appendUserTurn(turns(2), '  이번 달 식비?  ', LIMITS)
    expect(r).toEqual({
      ok: true,
      messages: [...turns(2), { role: 'user', content: '이번 달 식비?' }],
    })
  })

  it('rejects empty / whitespace-only input without touching history', () => {
    expect(appendUserTurn(turns(2), '   ', LIMITS)).toEqual({ ok: false, reason: 'empty' })
  })

  it('rejects content over the per-message cap', () => {
    expect(appendUserTurn([], 'ㄱ'.repeat(501), LIMITS)).toEqual({
      ok: false,
      reason: 'too_long',
    })
    expect(appendUserTurn([], 'ㄱ'.repeat(500), LIMITS).ok).toBe(true)
  })

  it('keeps the newest messages when the history overflows the cap', () => {
    const r = appendUserTurn(turns(14), '새 질문', LIMITS)
    expect(r.ok).toBe(true)
    if (!r.ok) throw new Error('unreachable')
    expect(r.messages).toHaveLength(12)
    expect(r.messages.at(-1)).toEqual({ role: 'user', content: '새 질문' })
    // The oldest three (m0..m2) were dropped; m3 is the first survivor.
    expect(r.messages[0]).toEqual({ role: 'assistant', content: 'm3' })
  })

  it('always ends with the new user message (Edge rejects a trailing assistant)', () => {
    for (const n of [0, 1, 11, 12, 30]) {
      const r = appendUserTurn(turns(n), 'q', LIMITS)
      expect(r.ok && r.messages.at(-1)?.role).toBe('user')
      expect(r.ok && r.messages.length <= LIMITS.messagesMax).toBe(true)
    }
  })
})
