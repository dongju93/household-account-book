import { describe, expect, it } from 'vite-plus/test'

import { polishInsightBullet } from './polishInsightText'

describe('polishInsightBullet', () => {
  it('replaces leaked English field names with Korean labels', () => {
    const raw = '식비가 remainingBudget -10100원, dailyAllowance 0원, balance가 흑자입니다.'
    const polished = polishInsightBullet(raw)
    expect(polished).not.toMatch(/remainingBudget|dailyAllowance|\bbalance\b/)
    expect(polished).toContain('잔여 예산')
    expect(polished).toContain('하루 허용액')
    expect(polished).toContain('수지')
    expect(polished).toContain('-₩10,100')
  })

  it('formats bare KRW integers with 원 into ₩ and thousand separators', () => {
    expect(polishInsightBullet('식비가 460100원으로 목표를 10100원 초과했습니다.')).toBe(
      '식비가 ₩460,100으로 목표를 ₩10,100 초과했습니다.',
    )
  })

  it('formats ₩ without commas (including negative forms)', () => {
    expect(polishInsightBullet('잔여 예산이 ₩-10100, 하루 허용액 ₩0입니다.')).toBe(
      '잔여 예산이 -₩10,100, 하루 허용액 ₩0입니다.',
    )
  })

  it('leaves short day counts, years, and already-formatted money alone', () => {
    const good = '2026년 남은 9일 동안 하루 허용액 ₩3,199 안에서만 쓰세요.'
    expect(polishInsightBullet(good)).toBe(good)
  })

  it('is idempotent on already-polished text', () => {
    const once = polishInsightBullet('식비 ₩460,100 · 잔여 예산 -₩10,100')
    expect(polishInsightBullet(once)).toBe(once)
  })
})
