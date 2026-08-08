import { describe, expect, it } from 'vitest'

import { OpenAIError, callOpenAIStructured, redactSecrets } from './openai.ts'

const VALID_RESULT = {
  draft: {
    amount: 4500,
    type: 'expense',
    categoryName: '식비',
    date: '2026-08-08',
    memo: '스타벅스',
  },
  confidence: 'high',
  warnings: [],
}

function requestOptions(fetchImpl: typeof fetch) {
  return {
    apiKey: 'test-key',
    feature: 'nl_txn_parse' as const,
    input: {
      text: '오늘 스타벅스 4500원 식비',
      today: '2026-08-08',
      categories: [{ id: 'c1', name: '식비', type: 'expense' }],
    },
    model: 'gpt-5.6-luna' as const,
    maxOutputTokens: 16_400,
    reasoningEffort: 'high' as const,
    safetyIdentifier: 'user-opaque-id',
    fetchImpl,
  }
}

describe('OpenAI Responses API boundary', () => {
  it('sends the required model policy and maps structured output plus usage', async () => {
    let requestedUrl = ''
    let requestBody: Record<string, unknown> | undefined
    const fetchImpl: typeof fetch = async (input, init) => {
      requestedUrl = String(input)
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          status: 'completed',
          model: 'gpt-5.6-luna',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: JSON.stringify(VALID_RESULT) }],
            },
          ],
          usage: { input_tokens: 123, output_tokens: 45, total_tokens: 168 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const result = await callOpenAIStructured(requestOptions(fetchImpl))

    expect(requestedUrl).toBe('https://api.openai.com/v1/responses')
    expect(requestBody).toMatchObject({
      model: 'gpt-5.6-luna',
      max_output_tokens: 16_400,
      reasoning: { effort: 'high' },
      safety_identifier: 'user-opaque-id',
      store: false,
      text: {
        format: {
          type: 'json_schema',
          name: 'nl_txn_parse_result',
          strict: true,
        },
      },
    })
    expect(result).toEqual({
      content: VALID_RESULT,
      model: 'gpt-5.6-luna',
      promptTokens: 123,
      completionTokens: 45,
    })
  })

  it('classifies a structured refusal without trying to parse it as JSON', async () => {
    const fetchImpl: typeof fetch = async () =>
      new Response(
        JSON.stringify({
          status: 'completed',
          model: 'gpt-5.6-luna',
          output: [
            {
              type: 'message',
              content: [{ type: 'refusal', refusal: 'Request refused' }],
            },
          ],
          usage: { input_tokens: 20, output_tokens: 4 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )

    await expect(callOpenAIStructured(requestOptions(fetchImpl))).rejects.toMatchObject<
      Partial<OpenAIError>
    >({
      kind: 'upstream',
      reason: 'refusal',
      usage: { promptTokens: 20, completionTokens: 4 },
    })
  })

  it('reports a reasoning-truncated response with both budget knobs, without retrying', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls++
      return new Response(
        JSON.stringify({
          status: 'incomplete',
          incomplete_details: { reason: 'max_output_tokens' },
          model: 'gpt-5.6-luna',
          output: [],
          usage: { input_tokens: 120, output_tokens: 16_400 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const err = await callOpenAIStructured(requestOptions(fetchImpl)).catch((e: unknown) => e)

    expect(err).toBeInstanceOf(OpenAIError)
    expect((err as OpenAIError).reason).toBe('incomplete')
    expect((err as OpenAIError).usage).toEqual({
      promptTokens: 120,
      completionTokens: 16_400,
    })
    // Ops must see which knob to move without reproducing the request.
    expect((err as OpenAIError).message).toContain('max_output_tokens=16400')
    expect((err as OpenAIError).message).toContain('effort=high')
    // Retrying a budget truncation just bills the same reasoning twice.
    expect(calls).toBe(1)
  })

  it('includes every billed parse attempt in the final failure usage', async () => {
    let calls = 0
    const fetchImpl: typeof fetch = async () => {
      calls++
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              content: [{ type: 'output_text', text: '{not-json' }],
            },
          ],
          usage: { input_tokens: 30, output_tokens: 7 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const err = await callOpenAIStructured(requestOptions(fetchImpl)).catch((e: unknown) => e)

    expect(calls).toBe(2)
    expect(err).toMatchObject<Partial<OpenAIError>>({
      kind: 'parse',
      reason: 'parse',
      usage: { promptTokens: 60, completionTokens: 14 },
    })
  })

  it('tells the retry why the previous attempt was rejected', async () => {
    // The checks that survive `strict: true` are the prose rules JSON Schema
    // cannot express, so an identical reroll fails at the same rate.
    const sentUsers: string[] = []
    const fetchImpl: typeof fetch = async (_input, init) => {
      const body = JSON.parse(String(init?.body)) as {
        input: Array<{ role: string; content: string }>
      }
      sentUsers.push(body.input.find((m) => m.role === 'user')?.content ?? '')
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [
            {
              type: 'message',
              // Schema-shaped but domain-invalid: confidence is not in the enum.
              content: [
                {
                  type: 'output_text',
                  text: JSON.stringify({ ...VALID_RESULT, confidence: 'certain' }),
                },
              ],
            },
          ],
          usage: { input_tokens: 30, output_tokens: 7 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    await expect(callOpenAIStructured(requestOptions(fetchImpl))).rejects.toBeInstanceOf(
      OpenAIError,
    )

    expect(sentUsers).toHaveLength(2)
    expect(sentUsers[0]).not.toContain('previous_attempt_rejected')
    expect(sentUsers[1]).toContain('previous_attempt_rejected')
    expect(sentUsers[1]).toContain('confidence는 high|medium|low 여야 합니다.')
  })

  it('spends one deadline across both attempts instead of restarting the clock', async () => {
    // A fresh timer on attempt 2 doubles wall clock and bill invisibly.
    let calls = 0
    let clock = 0
    const fetchImpl: typeof fetch = async () => {
      calls++
      clock += 30_000 // attempt 1 consumes the whole budget
      return new Response(
        JSON.stringify({
          status: 'completed',
          output: [{ type: 'message', content: [{ type: 'output_text', text: '{not-json' }] }],
          usage: { input_tokens: 30, output_tokens: 7 },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      )
    }

    const err = await callOpenAIStructured({
      ...requestOptions(fetchImpl),
      deadlineMs: 25_000,
      nowMs: () => clock,
    }).catch((e: unknown) => e)

    expect(calls).toBe(1)
    expect(err).toMatchObject<Partial<OpenAIError>>({ kind: 'parse', reason: 'parse' })
    // Only the one attempt that actually ran is billed to the user's quota.
    expect((err as OpenAIError).usage).toEqual({ promptTokens: 30, completionTokens: 7 })
  })

  it('redacts project keys and bearer values from provider error previews', () => {
    expect(redactSecrets('Bearer abc.def sk-proj-secret_value')).toBe(
      'Bearer [redacted] sk-[redacted]',
    )
  })
})
