/**
 * xAI Chat Completions (OpenAI-compatible) with structured json_schema output.
 * Spec: docs/4 §4.6 — timeout 20s, 1 parse/schema-validate retry.
 */

import { XAI_BASE_URL, XAI_TIMEOUT_MS, type AiFeature } from './config.ts'
import { buildFeaturePrompt } from './schemas.ts'
import type { XaiChatResult } from './types.ts'
import { validateFeatureResult } from './validate.ts'

export class XaiError extends Error {
  readonly kind: 'upstream' | 'parse'
  constructor(kind: 'upstream' | 'parse', message: string) {
    super(message)
    this.kind = kind
    this.name = 'XaiError'
  }
}

export type FetchLike = typeof fetch

export async function callXaiStructured(options: {
  apiKey: string
  feature: AiFeature
  input: unknown
  model: string
  maxTokens: number
  fetchImpl?: FetchLike
  timeoutMs?: number
}): Promise<XaiChatResult> {
  const fetchImpl = options.fetchImpl ?? fetch
  const timeoutMs = options.timeoutMs ?? XAI_TIMEOUT_MS
  const prompt = buildFeaturePrompt(options.feature, options.input)

  let lastParseError: Error | null = null
  for (let attempt = 0; attempt < 2; attempt++) {
    const raw = await chatCompletion({
      fetchImpl,
      apiKey: options.apiKey,
      model: options.model,
      maxTokens: options.maxTokens,
      timeoutMs,
      system: prompt.system,
      user: prompt.user,
      schemaName: prompt.schemaName,
      schema: prompt.schema,
    })

    try {
      const content = parseJsonContent(raw.contentText)
      // Schema check before settle/cache: JSON.parse alone accepts wrong shapes
      // (e.g. bullets: "…") that crash clients and poison the insight cache.
      const shape = validateFeatureResult(options.feature, content)
      if (!shape.ok) {
        throw new Error(shape.message)
      }
      return {
        content,
        model: raw.model || options.model,
        promptTokens: raw.promptTokens,
        completionTokens: raw.completionTokens,
      }
    } catch (e) {
      lastParseError = e instanceof Error ? e : new Error(String(e))
    }
  }

  throw new XaiError('parse', lastParseError?.message ?? 'structured output parse failed')
}

async function chatCompletion(args: {
  fetchImpl: FetchLike
  apiKey: string
  model: string
  maxTokens: number
  timeoutMs: number
  system: string
  user: string
  schemaName: string
  schema: Record<string, unknown>
}): Promise<{
  contentText: string
  model: string
  promptTokens: number
  completionTokens: number
}> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), args.timeoutMs)

  try {
    const res = await args.fetchImpl(`${XAI_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${args.apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: controller.signal,
      body: JSON.stringify({
        model: args.model,
        max_tokens: args.maxTokens,
        messages: [
          { role: 'system', content: args.system },
          { role: 'user', content: args.user },
        ],
        response_format: {
          type: 'json_schema',
          json_schema: {
            name: args.schemaName,
            strict: true,
            schema: args.schema,
          },
        },
      }),
    })

    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new XaiError(
        'upstream',
        `xAI HTTP ${res.status}${text ? `: ${text.slice(0, 200)}` : ''}`,
      )
    }

    const data = (await res.json()) as {
      model?: string
      choices?: { message?: { content?: string } }[]
      usage?: { prompt_tokens?: number; completion_tokens?: number }
    }

    const contentText = data.choices?.[0]?.message?.content
    if (typeof contentText !== 'string' || contentText.length === 0) {
      throw new XaiError('parse', 'empty completion content')
    }

    return {
      contentText,
      model: data.model ?? args.model,
      promptTokens: Number(data.usage?.prompt_tokens ?? 0),
      completionTokens: Number(data.usage?.completion_tokens ?? 0),
    }
  } catch (e) {
    if (e instanceof XaiError) throw e
    if (e instanceof Error && e.name === 'AbortError') {
      throw new XaiError('upstream', 'xAI request timed out')
    }
    throw new XaiError('upstream', e instanceof Error ? e.message : String(e))
  } finally {
    clearTimeout(timer)
  }
}

function parseJsonContent(text: string): unknown {
  const trimmed = text.trim()
  // Some models wrap JSON in fences despite schema mode.
  const unfenced = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
  return JSON.parse(unfenced)
}
