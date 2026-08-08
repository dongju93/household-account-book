import { describe, expect, it } from 'vitest'

import {
  AI_DISCLOSURE_VERSION,
  OPENAI_REASONING_EFFORTS,
  REASONING_HEADROOM_TOKENS,
  VISIBLE_OUTPUT_TOKENS,
  isEffectiveInAppAiOptIn,
  maxOutputTokensFor,
  parseOpenAIModel,
  parseOpenAIReasoningEffort,
  tokenEstimateFor,
} from './config.ts'

describe('AI disclosure consent', () => {
  it('requires both the opt-in flag and the current disclosure version', () => {
    expect(isEffectiveInAppAiOptIn(true, AI_DISCLOSURE_VERSION)).toBe(true)
    expect(isEffectiveInAppAiOptIn(true, null)).toBe(false)
    expect(isEffectiveInAppAiOptIn(true, 'xai-legacy')).toBe(false)
    expect(isEffectiveInAppAiOptIn(false, AI_DISCLOSURE_VERSION)).toBe(false)
    expect(isEffectiveInAppAiOptIn(undefined, undefined)).toBe(false)
  })
})

describe('OpenAI deployment config', () => {
  it.each(['gpt-5.6', 'gpt-5.6-sol', 'gpt-5.6-terra', 'gpt-5.6-luna'] as const)(
    'accepts GPT-5.6 family model %s',
    (model) => {
      expect(parseOpenAIModel(` ${model} `)).toBe(model)
    },
  )

  it.each(['gpt-5.5', 'gpt-4.1', '', 'gpt-5.6-unknown'])(
    'rejects model outside the supported GPT-5.6 family: %s',
    (model) => {
      expect(() => parseOpenAIModel(model)).toThrow('OPENAI_MODEL')
    },
  )

  it.each(['none', 'minimal', 'low', 'medium', 'high', 'xhigh', 'max'] as const)(
    'accepts reasoning effort %s',
    (effort) => {
      expect(parseOpenAIReasoningEffort(` ${effort} `)).toBe(effort)
    },
  )

  it.each(['', 'off', 'maximum', 'ultra'])('rejects unsupported reasoning effort: %s', (effort) => {
    expect(() => parseOpenAIReasoningEffort(effort)).toThrow('OPENAI_REASONING_EFFORT')
  })
})

describe('token budgets', () => {
  it('adds reasoning headroom to the visible output budget', () => {
    // Responses API counts reasoning against max_output_tokens; a visible-only
    // budget truncates mid-reasoning and returns nothing usable, already billed.
    expect(maxOutputTokensFor('month_insight', 'high')).toBe(
      VISIBLE_OUTPUT_TOKENS.month_insight + REASONING_HEADROOM_TOKENS.high,
    )
  })

  it("charges no headroom when effort is 'none'", () => {
    expect(maxOutputTokensFor('month_insight', 'none')).toBe(VISIBLE_OUTPUT_TOKENS.month_insight)
  })

  it('never budgets below the visible output the schema needs', () => {
    for (const effort of OPENAI_REASONING_EFFORTS) {
      for (const feature of Object.keys(VISIBLE_OUTPUT_TOKENS) as Array<
        keyof typeof VISIBLE_OUTPUT_TOKENS
      >) {
        expect(maxOutputTokensFor(feature, effort)).toBeGreaterThanOrEqual(
          VISIBLE_OUTPUT_TOKENS[feature],
        )
      }
    }
  })

  it('scales the quota reservation with effort', () => {
    // Reasoning tokens are billed as output, so an effort-blind reservation
    // under-claims and lets a user run past the monthly cap mid-request.
    expect(tokenEstimateFor('month_insight', 'high')).toBeGreaterThan(
      tokenEstimateFor('month_insight', 'none'),
    )
    expect(tokenEstimateFor('month_insight', 'max')).toBeGreaterThan(
      tokenEstimateFor('month_insight', 'high'),
    )
  })

  it('reserves no more than the ceiling it may spend', () => {
    for (const effort of OPENAI_REASONING_EFFORTS) {
      expect(tokenEstimateFor('month_insight', effort)).toBeLessThanOrEqual(
        maxOutputTokensFor('month_insight', effort) + VISIBLE_OUTPUT_TOKENS.month_insight,
      )
    }
  })
})
