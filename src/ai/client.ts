/**
 * Browser client for Edge `ai-gateway` (docs/4 §7.1, PR-3).
 * Never holds XAI_API_KEY — only user JWT via the Supabase singleton.
 */

import { supabase } from '../lib/supabase'
import {
  isAiErrorCode,
  type AiErrorCode,
  type AiGatewayErrorBody,
  type AiGatewayOkResponse,
  type AiGatewayRequest,
} from './types'

const FALLBACK_MESSAGES: Record<AiErrorCode, string> = {
  unauthorized: '로그인이 필요합니다.',
  forbidden: '이 AI 기능을 사용할 권한이 없습니다.',
  quota_exceeded: '이번 달 AI 이용 한도를 모두 사용했습니다.',
  flag_off: '인앱 AI 기능을 일시적으로 사용할 수 없습니다.',
  validation: '요청 형식이 올바르지 않습니다.',
  upstream: 'AI 서비스 응답에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  parse: 'AI 응답을 해석하지 못했습니다.',
}

const NETWORK_MESSAGE = '네트워크 오류로 AI 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.'
const UNKNOWN_MESSAGE = 'AI 오류가 발생했습니다. 잠시 후 다시 시도해 주세요.'

/** Structured failure from `invokeAiFeature` (Edge contract codes). */
export class AiClientError extends Error {
  readonly code: AiErrorCode
  readonly name = 'AiClientError'

  constructor(code: AiErrorCode, message?: string) {
    super(message && message.trim() ? message : FALLBACK_MESSAGES[code])
    this.code = code
  }
}

export function isAiClientError(error: unknown): error is AiClientError {
  return error instanceof AiClientError
}

/**
 * Call Edge `ai-gateway` with the shared envelope.
 * Resolves only on `ok: true`; every contract/network failure throws `AiClientError`.
 */
export async function invokeAiFeature<T = unknown>(
  body: AiGatewayRequest,
): Promise<AiGatewayOkResponse<T>> {
  const { data, error, response } = await supabase.functions.invoke<unknown>('ai-gateway', {
    body,
  })

  if (error) {
    throw await mapInvokeFailure(error, response)
  }

  if (isOkResponse<T>(data)) {
    return data
  }

  if (isErrorBody(data)) {
    throw new AiClientError(data.code, data.message)
  }

  throw new AiClientError('upstream', UNKNOWN_MESSAGE)
}

async function mapInvokeFailure(error: unknown, response?: Response): Promise<AiClientError> {
  const res = response ?? extractResponse(error)
  if (res) {
    const body = await tryParseJson(res)
    if (isErrorBody(body)) {
      return new AiClientError(body.code, body.message)
    }
  }

  // FunctionsFetchError / abort / unknown transport → treat as upstream-ish network.
  if (isNamedError(error, 'FunctionsFetchError')) {
    return new AiClientError('upstream', NETWORK_MESSAGE)
  }
  if (isNamedError(error, 'FunctionsRelayError')) {
    return new AiClientError('upstream', FALLBACK_MESSAGES.upstream)
  }

  // Non-2xx without a parseable contract body (e.g. gateway crash HTML).
  if (isNamedError(error, 'FunctionsHttpError')) {
    return new AiClientError('upstream', FALLBACK_MESSAGES.upstream)
  }

  return new AiClientError('upstream', UNKNOWN_MESSAGE)
}

function extractResponse(error: unknown): Response | undefined {
  if (!error || typeof error !== 'object') return undefined
  const ctx = (error as { context?: unknown }).context
  return ctx instanceof Response ? ctx : undefined
}

async function tryParseJson(res: Response): Promise<unknown> {
  try {
    // Body is unread when FunctionsHttpError is constructed (client throws before json()).
    return await res.json()
  } catch {
    return undefined
  }
}

function isOkResponse<T>(data: unknown): data is AiGatewayOkResponse<T> {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return d.ok === true && typeof d.feature === 'string' && 'result' in d
}

function isErrorBody(data: unknown): data is AiGatewayErrorBody {
  if (!data || typeof data !== 'object') return false
  const d = data as Record<string, unknown>
  return d.ok === false && isAiErrorCode(d.code) && typeof d.message === 'string'
}

function isNamedError(error: unknown, name: string): boolean {
  return (
    !!error &&
    typeof error === 'object' &&
    'name' in error &&
    (error as { name: unknown }).name === name
  )
}
