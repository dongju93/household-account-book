/**
 * Per-feature JSON Schema (strict) for xAI structured output + system prompts.
 * Spec: docs/4 §4.6, §5.1, §7.2
 */

import type { AiFeature } from './config.ts'

export interface FeaturePrompt {
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
}

const FUND_TYPE_ENUM = ['income', 'expense', 'saving', 'investment']

export function buildFeaturePrompt(feature: AiFeature, input: unknown): FeaturePrompt {
  switch (feature) {
    case 'nl_txn_parse':
      return nlTxnParsePrompt(input)
    case 'month_insight':
      return monthInsightPrompt(input)
    case 'month_close_narrative':
      return monthClosePrompt(input)
    case 'period_explain':
      return periodExplainPrompt(input)
    case 'category_suggest':
      return categorySuggestPrompt(input)
    case 'budget_recommend':
      return budgetRecommendPrompt(input)
    case 'chat_turn':
      return chatTurnPrompt(input)
  }
}

function nlTxnParsePrompt(input: unknown): FeaturePrompt {
  return {
    schemaName: 'nl_txn_parse_result',
    system: [
      '당신은 한국어 가계부 거래 초안 파서입니다.',
      '사용자 한 줄 입력을 구조화 JSON 초안으로 변환합니다.',
      'amount는 정수 KRW만 허용합니다(문자열·소수·한글 수사 금지). 예: "1만2천원" → 12000.',
      '확신이 없으면 해당 필드를 null로 두고 warnings에 한국어 힌트를 넣습니다.',
      '원장을 수정하지 않습니다. 초안만 반환합니다.',
      '날짜는 today(YYYY-MM-DD) 기준으로 상대 표현을 해석합니다.',
      'categoryName은 제공된 categories 목록의 이름만 사용하거나 null입니다.',
    ].join(' '),
    user: JSON.stringify(input),
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['draft', 'confidence', 'warnings'],
      properties: {
        draft: {
          type: 'object',
          additionalProperties: false,
          required: ['amount', 'type', 'categoryName', 'date', 'memo'],
          properties: {
            amount: { type: ['integer', 'null'], minimum: 1 },
            type: { type: ['string', 'null'], enum: [...FUND_TYPE_ENUM, null] },
            categoryName: { type: ['string', 'null'] },
            date: { type: ['string', 'null'] },
            memo: { type: ['string', 'null'] },
          },
        },
        confidence: { type: 'string', enum: ['high', 'medium', 'low'] },
        warnings: { type: 'array', items: { type: 'string' } },
      },
    },
  }
}

function monthInsightPrompt(input: unknown): FeaturePrompt {
  return {
    schemaName: 'month_insight_result',
    system: [
      '당신은 가계부 월간 인사이트 작성자입니다.',
      '제공된 집계 숫자만 근거로 한국어 불릿 2~4개를 작성합니다.',
      '숫자를 재계산하거나 지어내지 마세요. 제공되지 않은 카테고리/금액을 추가하지 마세요.',
      '비난 톤을 피하고 간결하게 작성합니다.',
      'groundedMonth는 입력 month와 동일해야 합니다.',
    ].join(' '),
    user: JSON.stringify(input),
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['bullets', 'groundedMonth'],
      properties: {
        bullets: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: { type: 'string' },
        },
        groundedMonth: { type: 'string' },
      },
    },
  }
}

function monthClosePrompt(input: unknown): FeaturePrompt {
  return {
    schemaName: 'month_close_narrative_result',
    system: [
      '당신은 월 마감 점검 서문을 쓰는 도우미입니다.',
      'findings(needsCheck, forReference) 라벨만 근거로 짧은 한국어 서문(2~4문장 또는 불릿)을 작성합니다.',
      '숫자를 재계산하지 마세요. 사용자를 비난하지 마세요.',
      '원본 거래 목록은 없습니다.',
    ].join(' '),
    user: JSON.stringify(input),
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['narrative', 'groundedMonth'],
      properties: {
        narrative: { type: 'string' },
        groundedMonth: { type: 'string' },
      },
    },
  }
}

function periodExplainPrompt(input: unknown): FeaturePrompt {
  return {
    schemaName: 'period_explain_result',
    system: [
      '당신은 가계부 통계 기간 해설자입니다.',
      '제공된 월별 집계만으로 한국어 해설 2~4 불릿을 작성합니다.',
      '숫자를 재계산하거나 없는 사실을 만들지 마세요.',
    ].join(' '),
    user: JSON.stringify(input),
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['bullets', 'periodKey'],
      properties: {
        bullets: {
          type: 'array',
          minItems: 2,
          maxItems: 4,
          items: { type: 'string' },
        },
        periodKey: { type: 'string' },
      },
    },
  }
}

function categorySuggestPrompt(input: unknown): FeaturePrompt {
  return {
    schemaName: 'category_suggest_result',
    system:
      '메모와 카테고리 목록을 보고 최대 3개 카테고리 이름 후보를 제안합니다. 목록 밖 이름은 금지입니다.',
    user: JSON.stringify(input),
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['suggestions'],
      properties: {
        suggestions: {
          type: 'array',
          maxItems: 3,
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['categoryName', 'type'],
            properties: {
              categoryName: { type: 'string' },
              type: { type: 'string', enum: FUND_TYPE_ENUM },
            },
          },
        },
      },
    },
  }
}

function budgetRecommendPrompt(input: unknown): FeaturePrompt {
  return {
    schemaName: 'budget_recommend_result',
    system:
      '카테고리별 예산 제안에 대한 짧은 한국어 한 줄 이유만 작성합니다. 제안 금액 숫자는 입력 휴리스틱을 따르고 재계산하지 마세요.',
    user: JSON.stringify(input),
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reasons'],
      properties: {
        reasons: {
          type: 'array',
          items: {
            type: 'object',
            additionalProperties: false,
            required: ['categoryName', 'reason'],
            properties: {
              categoryName: { type: 'string' },
              reason: { type: 'string' },
            },
          },
        },
      },
    },
  }
}

function chatTurnPrompt(input: unknown): FeaturePrompt {
  return {
    schemaName: 'chat_turn_result',
    system: [
      '당신은 가계부 읽기 전용 도우미입니다.',
      'context 스냅샷과 대화만 근거로 한국어로 답합니다.',
      '원장을 수정·삭제하는 도구는 없습니다. 없는 숫자를 만들지 마세요.',
    ].join(' '),
    user: JSON.stringify(input),
    schema: {
      type: 'object',
      additionalProperties: false,
      required: ['reply'],
      properties: {
        reply: { type: 'string' },
      },
    },
  }
}
