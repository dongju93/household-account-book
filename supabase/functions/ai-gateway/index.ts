/**
 * Supabase Edge Function: ai-gateway
 *
 * Provider-paid in-app AI entrypoint (docs/4 §4.6.1, §7.1).
 * Deploy: `supabase functions deploy ai-gateway` (not part of Amplify SPA build).
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import {
  CACHE_TTL_MS,
  CACHE_TRIM_KEEP,
  isEffectiveInAppAiOptIn,
  parseOpenAIModel,
  parseOpenAIReasoningEffort,
  type AiFeature,
  type MinRole,
} from './config.ts'
import { MESSAGES, errorBody, httpStatusFor } from './errors.ts'
import {
  corsPreflightResponse,
  handleAiGateway,
  jsonResponse,
  type GatewayDeps,
} from './gateway.ts'
import { OpenAIError, callOpenAIStructured } from './openai.ts'
import type { ClaimQuotaResult } from './types.ts'

Deno.serve(async (req: Request) => {
  // Preflight must answer even when secrets are missing, or the browser reports
  // an opaque CORS failure instead of the real error below.
  if (req.method === 'OPTIONS') {
    return corsPreflightResponse()
  }

  let deps: GatewayDeps
  try {
    deps = buildDeps(req)
  } catch (e) {
    // Misconfigured deployment (missing or invalid secret). Without this catch the
    // throw escapes as a raw platform 500 with no CORS headers and no audit line —
    // and it happens before AI_FEATURES_ENABLED, so the kill switch cannot mask it.
    console.error(
      JSON.stringify({
        audit: 'ai_gateway_config_error',
        error_detail: (e instanceof Error ? e.message : String(e)).slice(0, 400),
      }),
    )
    return jsonResponse(errorBody('upstream', MESSAGES.upstream), httpStatusFor('upstream'))
  }
  return handleAiGateway(req, deps)
})

function buildDeps(req: Request): GatewayDeps {
  const supabaseUrl = requiredEnv('SUPABASE_URL')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const openaiKey = Deno.env.get('OPENAI_API_KEY') ?? ''
  const model = parseOpenAIModel(requiredEnv('OPENAI_MODEL'))
  const reasoningEffort = parseOpenAIReasoningEffort(requiredEnv('OPENAI_REASONING_EFFORT'))

  // User-scoped client: JWT from caller → getUser + is_ledger_member (auth.uid()).
  const userClient = createClient(supabaseUrl, anonKey, {
    global: {
      headers: { Authorization: req.headers.get('Authorization') ?? '' },
    },
    auth: { persistSession: false, autoRefreshToken: false },
  })

  // Service role: quota RPC + cache write (authenticated policies deny writes).
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  return {
    aiFeaturesEnabledEnv: Deno.env.get('AI_FEATURES_ENABLED'),
    model,
    reasoningEffort,

    async getUserId(authHeader) {
      if (!authHeader || !authHeader.toLowerCase().startsWith('bearer ')) {
        return null
      }
      const token = authHeader.slice(7).trim()
      if (!token) return null
      const { data, error } = await userClient.auth.getUser(token)
      if (error || !data.user) return null
      return data.user.id
    },

    async isInAppAiEnabled(userId) {
      // Dark launch: missing row → disabled (default false).
      // Effective opt-in also requires disclosure_version == current so consent
      // for a prior foreign processor (e.g. xAI) cannot authorize OpenAI.
      const { data, error } = await admin
        .from('ai_user_settings')
        .select('in_app_ai_enabled, disclosure_version')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) {
        console.error(JSON.stringify({ audit: 'settings_error', error: error.message }))
        return false
      }
      return isEffectiveInAppAiOptIn(data?.in_app_ai_enabled, data?.disclosure_version)
    },

    async isLedgerMember(_userId, ledgerId, minRole) {
      // Must run with user JWT so is_ledger_member sees auth.uid().
      const { data, error } = await userClient.rpc('is_ledger_member', {
        p_ledger: ledgerId,
        p_min_role: minRole as MinRole,
      })
      if (error) {
        console.error(JSON.stringify({ audit: 'member_error', error: error.message }))
        return false
      }
      return data === true
    },

    async lookupCache({ ledgerId, feature, periodKey, dataVersionHash }) {
      const { data, error } = await admin
        .from('ai_insight_cache')
        .select('result_json, model, reasoning_effort, expires_at')
        .eq('ledger_id', ledgerId)
        .eq('feature', feature)
        .eq('period_key', periodKey)
        .eq('data_version_hash', dataVersionHash)
        .maybeSingle()
      if (error || !data) return null
      if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
        return null
      }
      return {
        result: data.result_json,
        model: data.model as string,
        reasoningEffort: typeof data.reasoning_effort === 'string' ? data.reasoning_effort : null,
      }
    },

    async claimQuota(userId, feature, tokenEstimate) {
      const { data, error } = await admin.rpc('claim_ai_quota', {
        p_feature: feature,
        p_token_estimate: tokenEstimate,
        p_user_id: userId,
      })
      if (error) {
        console.error(JSON.stringify({ audit: 'claim_error', error: error.message }))
        return { ok: false, reason: 'unknown_feature' } satisfies ClaimQuotaResult
      }
      // claim_ai_quota returns `day` (KST) on ok=true; gateway forwards it to
      // settle/refund so reservations settle on the claim day after midnight.
      return data as ClaimQuotaResult
    },

    async settleQuota(userId, feature, promptTokens, completionTokens, tokenEstimate, claimDay) {
      const { error } = await admin.rpc('settle_ai_quota', {
        p_feature: feature,
        p_prompt: promptTokens,
        p_completion: completionTokens,
        p_token_estimate: tokenEstimate,
        p_user_id: userId,
        // Same KST day as claim — do not recompute "today" at settle time.
        p_day: claimDay,
      })
      if (error) throw error
    },

    async refundQuota(userId, feature, tokenEstimate, claimDay) {
      const { error } = await admin.rpc('refund_ai_quota_request', {
        p_feature: feature,
        p_token_estimate: tokenEstimate,
        p_user_id: userId,
        p_day: claimDay,
      })
      if (error) throw error
    },

    async upsertCache({
      ledgerId,
      feature,
      periodKey,
      dataVersionHash,
      result,
      model,
      reasoningEffort,
    }) {
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
      const { error } = await admin.from('ai_insight_cache').upsert(
        {
          ledger_id: ledgerId,
          feature,
          period_key: periodKey,
          data_version_hash: dataVersionHash,
          result_json: result,
          model,
          reasoning_effort: reasoningEffort,
          expires_at: expiresAt,
        },
        { onConflict: 'ledger_id,feature,period_key,data_version_hash' },
      )
      if (error) throw error
      await trimCache(admin, ledgerId, feature, periodKey)
      // opportunistic expired purge
      await admin.from('ai_insight_cache').delete().lt('expires_at', new Date().toISOString())
    },

    async callOpenAI({
      feature,
      input,
      model,
      maxOutputTokens,
      reasoningEffort,
      safetyIdentifier,
    }) {
      if (!openaiKey) {
        // Common after deploy when secrets were not set/propagated.
        throw new OpenAIError('upstream', 'OPENAI_API_KEY is not configured', {
          reason: 'missing_key',
        })
      }
      return callOpenAIStructured({
        apiKey: openaiKey,
        feature,
        input,
        model,
        maxOutputTokens,
        reasoningEffort,
        safetyIdentifier,
      })
    },

    logAudit(entry) {
      console.log(JSON.stringify({ audit: 'ai_gateway', ...entry }))
    },

    nowMs: () => Date.now(),
  }
}

async function trimCache(
  admin: SupabaseClient,
  ledgerId: string,
  feature: AiFeature,
  periodKey: string,
): Promise<void> {
  const { data, error } = await admin
    .from('ai_insight_cache')
    .select('data_version_hash, created_at')
    .eq('ledger_id', ledgerId)
    .eq('feature', feature)
    .eq('period_key', periodKey)
    .order('created_at', { ascending: false })
  if (error || !data || data.length <= CACHE_TRIM_KEEP) return

  const drop = data.slice(CACHE_TRIM_KEEP).map((r) => r.data_version_hash as string)
  if (drop.length === 0) return
  await admin
    .from('ai_insight_cache')
    .delete()
    .eq('ledger_id', ledgerId)
    .eq('feature', feature)
    .eq('period_key', periodKey)
    .in('data_version_hash', drop)
}

function requiredEnv(name: string): string {
  const v = Deno.env.get(name)
  if (!v) {
    throw new Error(`Missing required env: ${name}`)
  }
  return v
}
