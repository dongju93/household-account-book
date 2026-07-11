/**
 * Payload hard limits — enforced before claim / xAI (docs/4 §4.8.4).
 * Pure functions; no I/O.
 */

import { isAiFeature, type AiFeature } from './config.ts'
import { FUND_TYPES, type AiGatewayRequest } from './types.ts'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const MONTH_RE = /^\d{4}-\d{2}$/

export type ValidationOk = { ok: true; value: AiGatewayRequest }
export type ValidationErr = { ok: false; message: string }
export type ValidationResult = ValidationOk | ValidationErr

function fail(message: string): ValidationErr {
  return { ok: false, message }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function isFundType(v: unknown): boolean {
  return typeof v === 'string' && (FUND_TYPES as readonly string[]).includes(v)
}

/** Parse raw body bytes → envelope; rejects oversize before JSON parse when length known. */
export function parseGatewayBody(
  rawText: string,
  rawByteLength: number,
  maxBytes: number,
): ValidationResult {
  if (rawByteLength > maxBytes) {
    return fail(`요청 본문이 ${maxBytes}바이트를 초과합니다.`)
  }
  let parsed: unknown
  try {
    parsed = JSON.parse(rawText)
  } catch {
    return fail('요청 JSON을 해석할 수 없습니다.')
  }
  return validateGatewayEnvelope(parsed)
}

export function validateGatewayEnvelope(body: unknown): ValidationResult {
  if (!isRecord(body)) return fail('요청 본문은 객체여야 합니다.')

  const { feature, ledgerId, input, dataVersionHash } = body

  if (!isAiFeature(feature)) {
    return fail('알 수 없는 feature 입니다.')
  }
  if (typeof ledgerId !== 'string' || !UUID_RE.test(ledgerId)) {
    return fail('ledgerId가 올바른 UUID가 아닙니다.')
  }
  if (input === undefined) {
    return fail('input이 필요합니다.')
  }
  if (dataVersionHash !== undefined && typeof dataVersionHash !== 'string') {
    return fail('dataVersionHash는 문자열이어야 합니다.')
  }
  if (typeof dataVersionHash === 'string' && dataVersionHash.length > 128) {
    return fail('dataVersionHash가 너무 깁니다.')
  }

  const inputCheck = validateFeatureInput(feature, input)
  if (!inputCheck.ok) return inputCheck

  const req: AiGatewayRequest = {
    feature,
    ledgerId,
    input,
  }
  if (typeof dataVersionHash === 'string') {
    req.dataVersionHash = dataVersionHash
  }
  return { ok: true, value: req }
}

export function validateFeatureInput(feature: AiFeature, input: unknown): ValidationResult {
  switch (feature) {
    case 'nl_txn_parse':
      return validateNlTxnParse(input)
    case 'category_suggest':
      return validateCategorySuggest(input)
    case 'month_insight':
      return validateMonthInsight(input)
    case 'period_explain':
      return validatePeriodExplain(input)
    case 'month_close_narrative':
      return validateMonthCloseNarrative(input)
    case 'budget_recommend':
      return validateBudgetRecommend(input)
    case 'chat_turn':
      return validateChatTurn(input)
    default:
      return fail('알 수 없는 feature 입니다.')
  }
}

function validateNlTxnParse(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('nl_txn_parse.input은 객체여야 합니다.')
  const { text, today, categories } = input
  if (typeof text !== 'string' || text.length === 0 || text.length > 200) {
    return fail('text는 1~200자여야 합니다.')
  }
  if (typeof today !== 'string' || !DATE_RE.test(today)) {
    return fail('today는 YYYY-MM-DD 형식이어야 합니다.')
  }
  if (!Array.isArray(categories) || categories.length === 0 || categories.length > 80) {
    return fail('categories는 1~80개여야 합니다.')
  }
  for (const c of categories) {
    if (!isRecord(c)) return fail('category 항목 형식이 올바르지 않습니다.')
    if (typeof c.id !== 'string' || c.id.length === 0) return fail('category.id가 필요합니다.')
    if (typeof c.name !== 'string' || c.name.length === 0 || c.name.length > 40) {
      return fail('category.name은 1~40자여야 합니다.')
    }
    if (!isFundType(c.type)) return fail('category.type이 올바르지 않습니다.')
  }
  return okPlaceholder()
}

function validateCategorySuggest(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('category_suggest.input은 객체여야 합니다.')
  const { memo, categories } = input
  if (typeof memo !== 'string' || memo.length === 0 || memo.length > 200) {
    return fail('memo는 1~200자여야 합니다.')
  }
  if (!Array.isArray(categories) || categories.length === 0 || categories.length > 80) {
    return fail('categories는 1~80개여야 합니다.')
  }
  return okPlaceholder()
}

function validateMonthInsight(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('month_insight.input은 객체여야 합니다.')
  const { month, summary, achievements, pace, topExpenses } = input
  if (typeof month !== 'string' || !MONTH_RE.test(month)) {
    return fail('month는 YYYY-MM 형식이어야 합니다.')
  }
  if (!isRecord(summary)) return fail('summary가 필요합니다.')
  if (!Array.isArray(achievements) || achievements.length > 40) {
    return fail('achievements는 최대 40개입니다.')
  }
  if (pace !== undefined && (!Array.isArray(pace) || pace.length > 40)) {
    return fail('pace는 최대 40개입니다.')
  }
  if (!Array.isArray(topExpenses) || topExpenses.length > 5) {
    return fail('topExpenses는 최대 5개입니다.')
  }
  return okPlaceholder()
}

function validatePeriodExplain(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('period_explain.input은 객체여야 합니다.')
  const { periodKey, months } = input
  if (typeof periodKey !== 'string' || periodKey.length === 0 || periodKey.length > 32) {
    return fail('periodKey가 필요합니다.')
  }
  if (!Array.isArray(months) || months.length === 0 || months.length > 12) {
    return fail('months는 1~12개여야 합니다.')
  }
  return okPlaceholder()
}

function validateMonthCloseNarrative(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('month_close_narrative.input은 객체여야 합니다.')
  const { month, needsCheck, forReference, truncated } = input
  if (typeof month !== 'string' || !MONTH_RE.test(month)) {
    return fail('month는 YYYY-MM 형식이어야 합니다.')
  }
  if (!Array.isArray(needsCheck) || !Array.isArray(forReference)) {
    return fail('needsCheck / forReference 배열이 필요합니다.')
  }
  if (needsCheck.length + forReference.length > 40) {
    return fail('findings 합계는 최대 40개입니다.')
  }
  if (typeof truncated !== 'boolean') {
    return fail('truncated는 boolean이어야 합니다.')
  }
  return okPlaceholder()
}

function validateBudgetRecommend(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('budget_recommend.input은 객체여야 합니다.')
  const { categories } = input
  if (!Array.isArray(categories) || categories.length === 0 || categories.length > 80) {
    return fail('categories는 1~80개여야 합니다.')
  }
  return okPlaceholder()
}

function validateChatTurn(input: unknown): ValidationResult {
  if (!isRecord(input)) return fail('chat_turn.input은 객체여야 합니다.')
  const { messages, context } = input
  if (!Array.isArray(messages) || messages.length === 0 || messages.length > 12) {
    return fail('messages는 1~12개여야 합니다.')
  }
  for (const m of messages) {
    if (!isRecord(m)) return fail('message 형식이 올바르지 않습니다.')
    if (m.role !== 'user' && m.role !== 'assistant') {
      return fail('message.role은 user 또는 assistant여야 합니다.')
    }
    if (typeof m.content !== 'string' || m.content.length === 0 || m.content.length > 500) {
      return fail('message.content는 1~500자여야 합니다.')
    }
  }
  if (context !== undefined) {
    let size: number
    try {
      size = new TextEncoder().encode(JSON.stringify(context)).length
    } catch {
      return fail('context를 직렬화할 수 없습니다.')
    }
    if (size > 8 * 1024) {
      return fail('chat context 스냅샷은 8KiB 이하여야 합니다.')
    }
  }
  return okPlaceholder()
}

/** Envelope already carries feature/ledger; input shape only was checked. */
function okPlaceholder(): ValidationResult {
  // Caller merges into full envelope; this branch only signals input OK.
  // We return a synthetic ok with empty envelope fields — validateGatewayEnvelope
  // never uses this return's value, only .ok. For validateFeatureInput public API
  // callers that only check ok/message, this is fine.
  return { ok: true, value: { feature: 'nl_txn_parse', ledgerId: '', input: null } }
}

/** Period key for cache row from feature input. */
export function periodKeyFor(feature: AiFeature, input: unknown): string | null {
  if (!isRecord(input)) return null
  switch (feature) {
    case 'month_insight':
    case 'month_close_narrative':
      return typeof input.month === 'string' ? input.month : null
    case 'period_explain':
      return typeof input.periodKey === 'string' ? input.periodKey : null
    default:
      return null
  }
}
