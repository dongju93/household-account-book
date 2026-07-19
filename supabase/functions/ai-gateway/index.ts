/**
 * Supabase Edge Function: ai-gateway
 *
 * Provider-paid in-app AI entrypoint (docs/4 §4.6.1, §7.1).
 * Deploy: `supabase functions deploy ai-gateway` (not part of Amplify SPA build).
 */

import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

import { CACHE_TTL_MS, CACHE_TRIM_KEEP, type AiFeature, type MinRole } from './config.ts'
import { handleAiGateway, type GatewayDeps } from './gateway.ts'
import type { ClaimQuotaResult } from './types.ts'
import { XaiError, callXaiStructured } from './xai.ts'

Deno.serve(async (req: Request) => {
  const deps = buildDeps(req)
  return handleAiGateway(req, deps)
})

function buildDeps(req: Request): GatewayDeps {
  const supabaseUrl = requiredEnv('SUPABASE_URL')
  const anonKey = requiredEnv('SUPABASE_ANON_KEY')
  const serviceRoleKey = requiredEnv('SUPABASE_SERVICE_ROLE_KEY')
  const xaiKey = Deno.env.get('XAI_API_KEY') ?? ''

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
    // Team model access varies; set without code change when 404 "model does not exist".
    defaultModel: Deno.env.get('XAI_DEFAULT_MODEL'),

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
      const { data, error } = await admin
        .from('ai_user_settings')
        .select('in_app_ai_enabled')
        .eq('user_id', userId)
        .maybeSingle()
      if (error) {
        console.error(JSON.stringify({ audit: 'settings_error', error: error.message }))
        return false
      }
      return data?.in_app_ai_enabled === true
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
        .select('result_json, model, expires_at')
        .eq('ledger_id', ledgerId)
        .eq('feature', feature)
        .eq('period_key', periodKey)
        .eq('data_version_hash', dataVersionHash)
        .maybeSingle()
      if (error || !data) return null
      if (data.expires_at && new Date(data.expires_at).getTime() <= Date.now()) {
        return null
      }
      return { result: data.result_json, model: data.model as string }
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

    async upsertCache({ ledgerId, feature, periodKey, dataVersionHash, result, model }) {
      const expiresAt = new Date(Date.now() + CACHE_TTL_MS).toISOString()
      const { error } = await admin.from('ai_insight_cache').upsert(
        {
          ledger_id: ledgerId,
          feature,
          period_key: periodKey,
          data_version_hash: dataVersionHash,
          result_json: result,
          model,
          expires_at: expiresAt,
        },
        { onConflict: 'ledger_id,feature,period_key,data_version_hash' },
      )
      if (error) throw error
      await trimCache(admin, ledgerId, feature, periodKey)
      // opportunistic expired purge
      await admin.from('ai_insight_cache').delete().lt('expires_at', new Date().toISOString())
    },

    async callXai({ feature, input, model, maxTokens }) {
      if (!xaiKey) {
        // Common after deploy when secrets were not set/propagated.
        throw new XaiError('upstream', 'XAI_API_KEY is not configured', {
          reason: 'missing_key',
        })
      }
      return callXaiStructured({
        apiKey: xaiKey,
        feature,
        input,
        model,
        maxTokens,
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
