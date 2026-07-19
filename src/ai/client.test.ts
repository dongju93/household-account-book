import { FunctionsHttpError } from '@supabase/supabase-js'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AiClientError, invokeAiFeature, isAiClientError } from './client'
import type { AiGatewayOkResponse, NlTxnParseResult } from './types'

const { invoke } = vi.hoisted(() => ({
  invoke: vi.fn(),
}))

vi.mock('../lib/supabase', () => ({
  supabase: {
    functions: {
      invoke,
    },
  },
}))

const LEDGER = '11111111-1111-4111-8111-111111111111'

const okBody: AiGatewayOkResponse<NlTxnParseResult> = {
  ok: true,
  feature: 'nl_txn_parse',
  result: {
    draft: {
      amount: 4500,
      type: 'expense',
      categoryName: '식비',
      date: '2026-07-11',
      memo: '스타벅스',
    },
    confidence: 'high',
    warnings: [],
  },
  model: 'grok-4.3',
  usage: { promptTokens: 100, completionTokens: 40 },
  quota: { remainingDaily: 39, remainingMonthly: 399 },
  cached: false,
}

function httpErrorResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

describe('invokeAiFeature', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('returns ok response on success', async () => {
    invoke.mockResolvedValue({ data: okBody, error: null })

    const result = await invokeAiFeature<NlTxnParseResult>({
      feature: 'nl_txn_parse',
      ledgerId: LEDGER,
      input: {
        text: '스타벅스 4500원 식비',
        today: '2026-07-12',
        categories: [{ id: 'c1', name: '식비', type: 'expense' }],
      },
    })

    expect(result).toEqual(okBody)
    expect(invoke).toHaveBeenCalledWith('ai-gateway', {
      body: {
        feature: 'nl_txn_parse',
        ledgerId: LEDGER,
        input: {
          text: '스타벅스 4500원 식비',
          today: '2026-07-12',
          categories: [{ id: 'c1', name: '식비', type: 'expense' }],
        },
      },
    })
  })

  it('maps FunctionsHttpError body codes (quota_exceeded)', async () => {
    const payload = {
      ok: false as const,
      code: 'quota_exceeded' as const,
      message: '오늘(한국 시간) AI 이용 한도를 모두 사용했습니다.',
    }
    const response = httpErrorResponse(429, payload)
    const error = new FunctionsHttpError(response)
    invoke.mockResolvedValue({ data: null, error, response })

    await expect(
      invokeAiFeature({
        feature: 'month_insight',
        ledgerId: LEDGER,
        input: { month: '2026-07' },
        dataVersionHash: 'abc',
      }),
    ).rejects.toMatchObject({
      name: 'AiClientError',
      code: 'quota_exceeded',
      message: payload.message,
    })
  })

  it.each([
    ['unauthorized', 401, '로그인이 필요합니다.'],
    ['forbidden', 403, '인앱 AI 사용이 꺼져 있습니다. 설정에서 켤 수 있습니다.'],
    ['flag_off', 403, '인앱 AI 기능을 일시적으로 사용할 수 없습니다.'],
    ['validation', 400, '요청 형식이 올바르지 않습니다.'],
    ['upstream', 502, 'AI 서비스 응답에 실패했습니다. 잠시 후 다시 시도해 주세요.'],
    ['parse', 422, 'AI 응답을 해석하지 못했습니다.'],
  ] as const)('maps error code %s', async (code, status, message) => {
    const payload = { ok: false as const, code, message }
    const response = httpErrorResponse(status, payload)
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(response),
      response,
    })

    try {
      await invokeAiFeature({
        feature: 'nl_txn_parse',
        ledgerId: LEDGER,
        input: { text: 'x', today: '2026-07-12', categories: [] },
      })
      expect.unreachable('should have thrown')
    } catch (e) {
      expect(isAiClientError(e)).toBe(true)
      expect((e as AiClientError).code).toBe(code)
      expect((e as AiClientError).message).toBe(message)
    }
  })

  it('maps ok:false body when returned without transport error', async () => {
    invoke.mockResolvedValue({
      data: {
        ok: false,
        code: 'forbidden',
        message: '이 AI 기능을 사용할 권한이 없습니다.',
      },
      error: null,
    })

    await expect(
      invokeAiFeature({
        feature: 'nl_txn_parse',
        ledgerId: LEDGER,
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'forbidden' })
  })

  it('maps FunctionsFetchError to upstream with network message', async () => {
    const fetchErr = Object.assign(new Error('Failed to send a request to the Edge Function'), {
      name: 'FunctionsFetchError',
      context: { cause: 'offline' },
    })
    invoke.mockResolvedValue({ data: null, error: fetchErr })

    await expect(
      invokeAiFeature({
        feature: 'nl_txn_parse',
        ledgerId: LEDGER,
        input: {},
      }),
    ).rejects.toMatchObject({
      code: 'upstream',
      message: expect.stringContaining('네트워크'),
    })
  })

  it('maps bare FunctionsHttpError without JSON body to upstream', async () => {
    const response = new Response('internal', { status: 500 })
    invoke.mockResolvedValue({
      data: null,
      error: new FunctionsHttpError(response),
      response,
    })

    await expect(
      invokeAiFeature({
        feature: 'nl_txn_parse',
        ledgerId: LEDGER,
        input: {},
      }),
    ).rejects.toMatchObject({ code: 'upstream' })
  })
})
