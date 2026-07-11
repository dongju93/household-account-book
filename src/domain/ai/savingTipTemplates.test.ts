import { describe, expect, it } from 'vite-plus/test'

import { formatPaceHint } from '../budgetPace'
import { buildSavingTipTemplates, type TipAchievement } from './savingTipTemplates'

const foodOver: TipAchievement = {
  name: '식비',
  type: 'expense',
  status: '초과',
  remaining: -50_000,
}
const busOver: TipAchievement = {
  name: '교통',
  type: 'expense',
  status: '초과',
  remaining: -10_000,
}
const foodOk: TipAchievement = {
  name: '식비',
  type: 'expense',
  status: '정상',
  remaining: 100_000,
}
const emerNear: TipAchievement = {
  name: '비상금',
  type: 'saving',
  status: '근접',
  remaining: 20_000,
}
const houseNear: TipAchievement = {
  name: '주택청약',
  type: 'saving',
  status: '근접',
  remaining: 5_000,
}
const emerOk: TipAchievement = {
  name: '비상금',
  type: 'saving',
  status: '진행중',
  remaining: 200_000,
}

describe('buildSavingTipTemplates', () => {
  it('emits balance tip when 수지 is negative', () => {
    const tips = buildSavingTipTemplates({
      summary: { balance: -42_500 },
      achievements: [],
    })
    expect(tips).toEqual(['이번 달 수지가 ₩42,500 부족합니다.'])
  })

  it('does not emit balance tip when non-negative', () => {
    expect(buildSavingTipTemplates({ summary: { balance: 0 }, achievements: [] })).toEqual([])
    expect(buildSavingTipTemplates({ summary: { balance: 1 }, achievements: [] })).toEqual([])
  })

  it('counts over-budget expense categories and names the worst overspend', () => {
    const tips = buildSavingTipTemplates({
      summary: { balance: 100_000 },
      achievements: [busOver, foodOver, foodOk],
    })
    expect(tips).toEqual(['예산 초과 카테고리 2개 (최대 초과: 식비).'])
  })

  it('lists up to 2 near-goal saving categories', () => {
    const tips = buildSavingTipTemplates({
      summary: { balance: 100_000 },
      achievements: [emerNear, houseNear, emerOk],
    })
    expect(tips).toEqual(['저축 목표에 가까운 항목: 비상금, 주택청약.'])
  })

  it('emits all three rules in priority order, capped at 3', () => {
    const tips = buildSavingTipTemplates({
      summary: { balance: -1_000 },
      achievements: [foodOver, busOver, emerNear, houseNear],
    })
    expect(tips).toHaveLength(3)
    expect(tips[0]).toBe('이번 달 수지가 ₩1,000 부족합니다.')
    expect(tips[1]).toBe('예산 초과 카테고리 2개 (최대 초과: 식비).')
    expect(tips[2]).toBe('저축 목표에 가까운 항목: 비상금, 주택청약.')
  })

  it('never duplicates formatPaceHint daily-allowance wording', () => {
    const tips = buildSavingTipTemplates({
      summary: { balance: -5_000 },
      achievements: [foodOver, emerNear],
    })
    const paceCopy = formatPaceHint({
      daysRemaining: 10,
      dailyAllowance: 5_000,
      remainingBudget: 50_000,
    })
    // Pace hint shape: "남은 N일 · 하루 ₩X"
    expect(paceCopy).toMatch(/^남은 \d+일 · 하루 ₩/)
    for (const tip of tips) {
      expect(tip).not.toMatch(/남은 \d+일/)
      expect(tip).not.toMatch(/하루 ₩/)
      expect(tip).not.toBe(paceCopy)
    }
  })
})
