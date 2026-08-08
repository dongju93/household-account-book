import { AI_DISCLOSURE_VERSION } from '../ai/types'
import { supabase } from '../lib/supabase'

/**
 * Per-user in-app AI preferences (`ai_user_settings`).
 * Dark launch: missing row ≡ disabled (matches Edge `isInAppAiEnabled`).
 * Residual quota UI is intentionally out of scope (S13 / PR-17).
 *
 * Effective opt-in requires both the boolean and a matching
 * `disclosure_version` so a prior consent for a different foreign processor
 * cannot silently authorize a new one (xAI → OpenAI).
 */
export interface AiUserSettings {
  userId: string
  /** Effective: true only when the stored flag is on *and* disclosure matches current. */
  inAppAiEnabled: boolean
  /** Last disclosure/provider revision the user accepted; null if never under current schema. */
  disclosureVersion: string | null
  shareMemoWithAi: boolean
  updatedAt: string | null
}

// PostgREST rows are loosely typed
// oxlint-disable-next-line typescript/no-explicit-any
type Row = Record<string, any>

/** Pure gate shared with mapping — true only for current disclosure consent. */
export function isEffectiveInAppAiEnabled(
  enabled: boolean,
  disclosureVersion: string | null | undefined,
): boolean {
  return enabled === true && disclosureVersion === AI_DISCLOSURE_VERSION
}

function mapAiUserSettings(r: Row): AiUserSettings {
  const disclosureVersion = typeof r.disclosure_version === 'string' ? r.disclosure_version : null
  return {
    userId: r.user_id,
    inAppAiEnabled: isEffectiveInAppAiEnabled(r.in_app_ai_enabled === true, disclosureVersion),
    disclosureVersion,
    shareMemoWithAi: r.share_memo_with_ai !== false,
    updatedAt: r.updated_at ?? null,
  }
}

/** Default when no row exists — same as Edge dark-launch semantics. */
export function defaultAiUserSettings(userId: string): AiUserSettings {
  return {
    userId,
    inAppAiEnabled: false,
    disclosureVersion: null,
    shareMemoWithAi: true,
    updatedAt: null,
  }
}

const SETTINGS_SELECT =
  'user_id, in_app_ai_enabled, disclosure_version, share_memo_with_ai, updated_at'

export async function getAiUserSettings(userId: string): Promise<AiUserSettings> {
  const { data, error } = await supabase
    .from('ai_user_settings')
    .select(SETTINGS_SELECT)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return defaultAiUserSettings(userId)
  return mapAiUserSettings(data)
}

/**
 * Upsert opt-in/out. Preserves `share_memo_with_ai` when a row already exists;
 * new rows take the table default for that column.
 *
 * Opt-in stamps `disclosure_version` to the current provider disclosure so the
 * gateway can refuse transmission under a later provider without a re-prompt.
 * Opt-out clears the flag only (version kept as last-accepted audit).
 */
export async function setInAppAiEnabled(userId: string, enabled: boolean): Promise<AiUserSettings> {
  const current = await getAiUserSettings(userId)
  const { data, error } = await supabase
    .from('ai_user_settings')
    .upsert(
      {
        user_id: userId,
        in_app_ai_enabled: enabled,
        share_memo_with_ai: current.shareMemoWithAi,
        ...(enabled ? { disclosure_version: AI_DISCLOSURE_VERSION } : {}),
      },
      { onConflict: 'user_id' },
    )
    .select(SETTINGS_SELECT)
    .single()
  if (error) throw error
  return mapAiUserSettings(data)
}
