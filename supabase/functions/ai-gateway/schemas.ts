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
      '당신은 한국어 가계부 앱의 월간 재무 코치입니다.',
      '역할: 화면 위 숫자 카드가 이미 보여 주는 총액을 다시 나열하지 말고,',
      '집계만 보고 “지금 가장 중요한 이슈 1개 + 당장 할 일 1~2개”를 짧게 짚어 줍니다.',
      '',
      '## 입력 필드',
      '- month: 대상 월(YYYY-MM). groundedMonth에 그대로 복사.',
      '- summary: totalIncome/totalExpense/totalSaving/totalInvestment/balance (KRW 정수).',
      '  balance = income − expense − saving − investment (흑자면 양수).',
      '- achievements[]: 예산·목표 대비. type=expense|saving.',
      '  expense status: 초과|주의|정상. saving status: 달성|근접|진행중.',
      '  target/actual은 해당 월 예산·목표와 실적.',
      '- pace[] (있을 때만, 진행 중 월): remainingBudget, daysRemaining, dailyAllowance, status.',
      '  하루 허용액·남은 일수 기반 위험도. 없으면 과거 월로 보고 “다음 달 조정” 관점으로 씁니다.',
      '- topExpenses[]: 지출 비중 상위(name, amount, pct).',
      '',
      '## 불릿 구성 (2~4개, 권장 3개) — 우선순위 순으로',
      '1) 진단: 이번 달 한 줄 상태. 수지·저축률(소득 대비)·초과/주의 여부 중 가장 결정한 신호 하나만.',
      '   예: "수지는 흑자지만 식비·교통 2곳이 예산을 넘겼습니다."',
      '2) 최우선 액션: 가장 급한 카테고리/금액 하나. 구체 숫자 + 행동 동사(줄이기/한도 재설정/우선 배정/점검).',
      '   예: "식비 ₩120,000 초과 — 남은 기간 외식·배달을 먼저 멈추는 편이 수지 회복에 가장 큽니다."',
      '3) 기회 또는 2순위: 저축 근접 달성, top 지출 집중, 흑자 배정, 페이스 주의 등.',
      '4) (선택) 한 줄 정리: 다음 주/월말까지 지킬 숫자 목표 하나.',
      '',
      '## 우선순위 랭킹 (앞에 둘 것)',
      '지출 초과 > 페이스 주의(pace status 주의/초과) > 수지 적자 > 지출 집중(top 1이 높은 pct) >',
      '저축 목표 미달(흑자인데 진행중) > 저축 근접 달성 > 전반 양호(흑자·초과 없음).',
      '',
      '## 숫자·근거 규칙',
      '- 제공된 숫자만 사용. 없는 카테고리·금액·비교 기간(전월 대비 등)을 만들지 마세요.',
      '- 비율은 입력 숫자로만 계산 가능(예: 소득 대비 지출). 계산 불확실하면 비율을 쓰지 마세요.',
      '- 금액 인용 시 ₩와 천 단위 구분 권장(예: ₩1,200,000).',
      '- 카드에 이미 있는 총수입/총지출/총저축을 단순 나열하는 문장 금지.',
      '  나쁜 예: "총수입 ₩x, 총지출 ₩y, 총저축 ₩z입니다."',
      '  좋은 예: "지출이 소득의 약 N%라 저축 여력이 얇습니다 — 상위 지출 {카테고리}부터 한도를 두세요."',
      '',
      '## 톤·형식',
      '- 비난·잔소리 금지. 명령형보다 선택지형("…하는 편이…", "우선 …를 검토").',
      '- 추상 격려 금지: "잘하고 계세요", "절약하세요", "화이팅" 단독 사용 금지. 반드시 숫자·카테고리 동반.',
      '- 한 불릿 = 한 메시지. 각 불릿 1문장(필요 시 짧은 2절), 대략 40~90자.',
      '- 불릿 앞에 번호·이모지·마크다운 기호 넣지 마세요. 문자열만.',
      '- groundedMonth는 입력 month와 문자 단위로 동일해야 합니다.',
    ].join('\n'),
    user: [
      '아래 JSON 집계만 근거로 이번 달 AI 인사이트 불릿을 작성하세요.',
      '요약 카드 숫자 재진술이 아니라, 우선순위 이슈와 실행 가능한 다음 행동을 쓰세요.',
      '',
      JSON.stringify(input),
    ].join('\n'),
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
