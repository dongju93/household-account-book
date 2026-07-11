import { supabase } from '../lib/supabase'

/**
 * Per-user in-app AI preferences (`ai_user_settings`).
 * Dark launch: missing row ≡ disabled (matches Edge `isInAppAiEnabled`).
 * Residual quota UI is intentionally out of scope (S13 / PR-17).
 */
export interface AiUserSettings {
  userId: string
  inAppAiEnabled: boolean
  shareMemoWithAi: boolean
  updatedAt: string | null
}

// PostgREST rows are loosely typed
// oxlint-disable-next-line typescript/no-explicit-any
type Row = Record<string, any>

function mapAiUserSettings(r: Row): AiUserSettings {
  return {
    userId: r.user_id,
    inAppAiEnabled: r.in_app_ai_enabled === true,
    shareMemoWithAi: r.share_memo_with_ai !== false,
    updatedAt: r.updated_at ?? null,
  }
}

/** Default when no row exists — same as Edge dark-launch semantics. */
export function defaultAiUserSettings(userId: string): AiUserSettings {
  return {
    userId,
    inAppAiEnabled: false,
    shareMemoWithAi: true,
    updatedAt: null,
  }
}

export async function getAiUserSettings(userId: string): Promise<AiUserSettings> {
  const { data, error } = await supabase
    .from('ai_user_settings')
    .select('user_id, in_app_ai_enabled, share_memo_with_ai, updated_at')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  if (!data) return defaultAiUserSettings(userId)
  return mapAiUserSettings(data)
}

/**
 * Upsert opt-in/out. Preserves `share_memo_with_ai` when a row already exists;
 * new rows take the table default for that column.
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
      },
      { onConflict: 'user_id' },
    )
    .select('user_id, in_app_ai_enabled, share_memo_with_ai, updated_at')
    .single()
  if (error) throw error
  return mapAiUserSettings(data)
}
