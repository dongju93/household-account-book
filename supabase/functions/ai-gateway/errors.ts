import type { AiErrorCode, AiGatewayErrorResponse } from './types.ts'

export function errorBody(code: AiErrorCode, message: string): AiGatewayErrorResponse {
  return { ok: false, code, message }
}

/** HTTP status for each contract error code. */
export function httpStatusFor(code: AiErrorCode): number {
  switch (code) {
    case 'unauthorized':
      return 401
    case 'forbidden':
    case 'flag_off':
      return 403
    case 'quota_exceeded':
      return 429
    case 'validation':
      return 400
    case 'parse':
      return 422
    case 'upstream':
      return 502
    default:
      return 500
  }
}

export function quotaExceededMessage(reason: string | undefined): string {
  if (reason === 'daily') {
    return '오늘(한국 시간) AI 이용 한도를 모두 사용했습니다.'
  }
  // monthly | tokens | unknown_feature (treat conservatively as month)
  return '이번 달 AI 이용 한도를 모두 사용했습니다.'
}

export const MESSAGES = {
  unauthorized: '로그인이 필요합니다.',
  forbidden: '이 AI 기능을 사용할 권한이 없습니다.',
  optedOut: '인앱 AI 사용이 꺼져 있습니다. 설정에서 켤 수 있습니다.',
  flagOff: '인앱 AI 기능을 일시적으로 사용할 수 없습니다.',
  validation: '요청 형식이 올바르지 않습니다.',
  bodyTooLarge: '요청 본문이 너무 큽니다.',
  invalidJson: '요청 JSON을 해석할 수 없습니다.',
  upstream: 'AI 서비스 응답에 실패했습니다. 잠시 후 다시 시도해 주세요.',
  parse: 'AI 응답을 해석하지 못했습니다.',
  missingHash: '캐시 가능한 기능에는 dataVersionHash가 필요합니다.',
} as const
