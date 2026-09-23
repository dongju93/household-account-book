import { describe, expect, it } from 'vitest'

import { TRUNCATION_MARK, appendUserTurn, type ChatMessage } from './chatTurn'

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
    const messages = [...turns(2), { role: 'user', content: '이번 달 식비?' }]
    expect(r).toEqual({ ok: true, messages, wire: messages })
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

  it('clamps an over-cap assistant reply on the wire but keeps it whole for display', () => {
    // The Edge returns replies up to replyMax (1,200) yet validates history at contentMax (500).
    const reply = 'ㄴ'.repeat(1200)
    const history: ChatMessage[] = [
      { role: 'user', content: 'q1' },
      { role: 'assistant', content: reply },
    ]
    const r = appendUserTurn(history, 'q2', LIMITS)
    if (!r.ok) throw new Error('unreachable')

    expect(r.messages[1].content).toBe(reply)
    const clamped = r.wire[1].content
    expect(clamped).toHaveLength(LIMITS.contentMax)
    expect(clamped.endsWith(TRUNCATION_MARK)).toBe(true)
    expect(r.wire.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    for (const m of r.wire) expect(m.content.length).toBeLessThanOrEqual(LIMITS.contentMax)
  })

  it('never splits a surrogate pair when clamping', () => {
    // 499 BMP chars then an astral char straddling the cut point.
    const reply = 'a'.repeat(498) + '😀' + 'b'.repeat(10)
    const r = appendUserTurn([{ role: 'assistant', content: reply }], 'q', LIMITS)
    if (!r.ok) throw new Error('unreachable')
    const clamped = r.wire[0].content
    expect(clamped.length).toBeLessThanOrEqual(LIMITS.contentMax)
    expect(clamped).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/)
    expect(clamped.endsWith(TRUNCATION_MARK)).toBe(true)
  })
})
