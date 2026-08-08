/**
 * OpenAI Responses API with strict structured JSON output.
 * Timeout is 20s and invalid provider output is retried once before failing.
 */

import {
  OPENAI_BASE_URL,
  OPENAI_TIMEOUT_MS,
  type AiFeature,
  type OpenAIModel,
  type OpenAIReasoningEffort,
} from './config.ts'
import { buildFeaturePrompt } from './schemas.ts'
import type { OpenAIResult } from './types.ts'
import { validateFeatureResult } from './validate.ts'

export interface OpenAIUsage {
  promptTokens: number
  completionTokens: number
}

/** Why the OpenAI call failed - ops logs only; never sent to the client. */
export type OpenAIFailureReason =
  | 'timeout'
  | 'http'
  | 'missing_key'
  | 'network'
  | 'parse'
  | 'empty'
  | 'incomplete'
  | 'refusal'

export class OpenAIError extends Error {
  readonly kind: 'upstream' | 'parse'
  /** HTTP status from api.openai.com when reason is `http`. */
  readonly status?: number
  readonly reason?: OpenAIFailureReason
  /** Provider-reported usage when the failed response was still billed. */
  readonly usage?: OpenAIUsage
  constructor(
    kind: 'upstream' | 'parse',
    message: string,
    opts?: { status?: number; reason?: OpenAIFailureReason; usage?: OpenAIUsage },
  ) {
    super(message)
    this.kind = kind
    this.name = 'OpenAIError'
    this.status = opts?.status
    this.reason = opts?.reason
    this.usage = opts?.usage
  }
}

export type FetchLike = typeof fetch

export async function callOpenAIStructured(options: {
  apiKey: string
  feature: AiFeature
  input: unknown
  model: OpenAIModel
  /** Wire `max_output_tokens`: reasoning + visible output. See `maxOutputTokensFor`. */
  maxOutputTokens: number
  reasoningEffort: OpenAIReasoningEffort
  safetyIdentifier: string
  fetchImpl?: FetchLike
  timeoutMs?: number
}): Promise<OpenAIResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? OPENAI_TIMEOUT_MS
  const prompt = buildFeaturePrompt(options.feature, options.input)

  let lastParseError: Error | null = null
  let billedUsage: OpenAIUsage = { promptTokens: 0, completionTokens: 0 }
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await createResponse({
      fetchImpl,
      apiKey: options.apiKey,
      model: options.model,
      maxOutputTokens: options.maxOutputTokens,
      reasoningEffort: options.reasoningEffort,
      safetyIdentifier: options.safetyIdentifier,
      timeoutMs,
      system: prompt.system,
      user: prompt.user,
      schemaName: prompt.schemaName,
      schema: prompt.schema,
    })
    billedUsage = addUsage(billedUsage, raw.usage)

    try {
      const content = parseJsonContent(raw.contentText)
      // Schema check before settle/cache: JSON.parse alone accepts wrong shapes
      // (e.g. bullets: "...") that crash clients and poison the insight cache.
      const shape = validateFeatureResult(options.feature, content)
      if (!shape.ok) {
        throw new Error(shape.message)
      }
      return {
        content,
        // Cache identity follows the validated deployment model, not a provider
        // snapshot id that may differ from the requested alias.
        model: options.model,
        promptTokens: billedUsage.promptTokens,
        completionTokens: billedUsage.completionTokens,
      }
    } catch (e) {
      lastParseError = e instanceof Error ? e : new Error(String(e))
    }
  }

  throw new OpenAIError('parse', lastParseError?.message ?? 'structured output parse failed', {
    reason: 'parse',
    usage: billedUsage,
  })
}

async function createResponse(args: {
  fetchImpl: FetchLike
  apiKey: string
  model: OpenAIModel
  maxOutputTokens: number
  reasoningEffort: OpenAIReasoningEffort
  safetyIdentifier: string
  timeoutMs: number
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
}): Promise<{
  contentText: string
  usage: OpenAIUsage
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)

  try {
    const res = await args.fetchImpl(`${OPENAI_BASE_URL}/responses`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.model,
        max_output_tokens: args.maxOutputTokens,
        reasoning: { effort: args.reasoningEffort },
        safety_identifier: args.safetyIdentifier,
        store: false,
        input: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
        text: {
          format: {
            type: 'json_schema',
            name: args.schemaName,
            strict: true,
            schema: args.schema,
          },
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      // Cap body preview; never log Authorization. Provider bodies can include
      // request ids / error codes that distinguish key, model, and rate failures.
      const preview = redactSecrets(text).slice(0, 300)
      throw new OpenAIError(
        'upstream',
        `OpenAI HTTP ${res.status}${preview ? `: ${preview}` : ''}`,
        {
          status: res.status,
          reason: 'http',
        },
      )
    }

    const data = (await res.json()) as OpenAIResponse
    const usage = usageFromResponse(data)
    if (data.status !== 'completed') {
      const detail = data.incomplete_details?.reason
      // `max_output_tokens` here means the budget ran out before a usable result,
      // usually reasoning effort raised without matching headroom. Log both knobs
      // so ops does not have to guess which one to move.
      const hint =
        detail === 'max_output_tokens'
          ? ` (max_output_tokens=${args.maxOutputTokens}, effort=${args.reasoningEffort})`
          : ''
      throw new OpenAIError(
        'upstream',
        `OpenAI response ${data.status ?? 'incomplete'}${detail ? `: ${detail}` : ''}${hint}`,
        { reason: 'incomplete', usage },
      )
    }

    const contentText = extractOutputText(data.output, usage)
    if (contentText.length === 0) {
      throw new OpenAIError('parse', 'empty response output', { reason: 'empty', usage })
    }

    return {
      contentText,
      usage,
    }
  } catch (e) {
    if (e instanceof OpenAIError) throw e
    if (e instanceof Error && e.name === 'AbortError') {
      throw new OpenAIError('upstream', 'OpenAI request timed out', { reason: 'timeout' })
    }
    throw new OpenAIError('upstream', e instanceof Error ? e.message : String(e), {
      reason: 'network',
    })
  } finally {
    clearTimeout(timer)
  }
}

interface OpenAIResponse {
  status?: string
  incomplete_details?: { reason?: string } | null
  output?: Array<{
    type?: string
    content?: Array<{
      type?: string
      text?: string
      refusal?: string
    }>
  }>
  usage?: { input_tokens?: number; output_tokens?: number }
}

function extractOutputText(output: OpenAIResponse['output'], usage: OpenAIUsage): string {
  const chunks: string[] = []
  for (const item of output ?? []) {
    if (item.type !== 'message') continue
    for (const content of item.content ?? []) {
      if (content.type === 'refusal') {
        throw new OpenAIError('upstream', 'OpenAI refused the request', {
          reason: 'refusal',
          usage,
        })
      }
      if (content.type === 'output_text' && typeof content.text === 'string') {
        chunks.push(content.text)
      }
    }
  }
  return chunks.join('')
}

function usageFromResponse(data: OpenAIResponse): OpenAIUsage {
  return {
    promptTokens: Number(data.usage?.input_tokens ?? 0),
    completionTokens: Number(data.usage?.output_tokens ?? 0),
  }
}

function addUsage(left: OpenAIUsage, right: OpenAIUsage): OpenAIUsage {
  return {
    promptTokens: left.promptTokens + right.promptTokens,
    completionTokens: left.completionTokens + right.completionTokens,
  }
}

/** Strip credential-like substrings from provider error bodies before logging. */
export function redactSecrets(text: string): string {
  return text
    .replace(/Bearer\s+[A-Za-z0-9._\-+/=]+/gi, 'Bearer [redacted]')
    .replace(/sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]+/g, 'sk-[redacted]')
}

function parseJsonContent(text: string): unknown {
  const trimmed = text.trim()
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(unfenced)
}
