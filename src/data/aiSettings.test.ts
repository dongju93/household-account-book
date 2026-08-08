import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

const { maybeSingle, single, selectEq, upsert, from } = vi.hoisted(() => {
  const maybeSingle = vi.fn()
  const single = vi.fn()
  const selectEq = {
    eq: vi.fn(() => ({ maybeSingle })),
  }
  const upsert = vi.fn(() => ({
    select: vi.fn(() => ({ single })),
  }))
  const from = vi.fn(() => ({
    select: vi.fn(() => selectEq),
    upsert,
  }))
  return { maybeSingle, single, selectEq, upsert, from }
})

vi.mock('../lib/supabase', () => ({
  supabase: { from },
}))

import { AI_DISCLOSURE_VERSION } from '../ai/types'
import {
  defaultAiUserSettings,
  getAiUserSettings,
  isEffectiveInAppAiEnabled,
  setInAppAiEnabled,
} from './aiSettings'

const USER = 'user-1'

beforeEach(() => {
  vi.clearAllMocks()
  from.mockImplementation(() => ({
    select: vi.fn(() => selectEq),
    upsert,
  }))
  selectEq.eq.mockReturnValue({ maybeSingle })
  upsert.mockReturnValue({
    select: vi.fn(() => ({ single })),
  })
})

describe('isEffectiveInAppAiEnabled', () => {
  it('is true only when the flag is on and disclosure matches current', () => {
    expect(isEffectiveInAppAiEnabled(true, AI_DISCLOSURE_VERSION)).toBe(true)
    expect(isEffectiveInAppAiEnabled(true, 'xai-legacy')).toBe(false)
    expect(isEffectiveInAppAiEnabled(true, null)).toBe(false)
    expect(isEffectiveInAppAiEnabled(false, AI_DISCLOSURE_VERSION)).toBe(false)
    expect(isEffectiveInAppAiEnabled(false, null)).toBe(false)
  })
})

describe('getAiUserSettings', () => {
  it('returns dark-launch defaults when no row exists', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(getAiUserSettings(USER)).resolves.toEqual(defaultAiUserSettings(USER))
    expect(from).toHaveBeenCalledWith('ai_user_settings')
  })

  it('maps an existing row with current disclosure to camelCase effective on', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: true,
        disclosure_version: AI_DISCLOSURE_VERSION,
        share_memo_with_ai: false,
        updated_at: '2026-07-12T00:00:00Z',
      },
      error: null,
    })

    await expect(getAiUserSettings(USER)).resolves.toEqual({
      userId: USER,
      inAppAiEnabled: true,
      disclosureVersion: AI_DISCLOSURE_VERSION,
      shareMemoWithAi: false,
      updatedAt: '2026-07-12T00:00:00Z',
    })
  })

  it('treats flag true + stale/missing disclosure as opted out', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: true,
        disclosure_version: null,
        share_memo_with_ai: true,
        updated_at: '2026-07-12T00:00:00Z',
      },
      error: null,
    })

    await expect(getAiUserSettings(USER)).resolves.toMatchObject({
      userId: USER,
      inAppAiEnabled: false,
      disclosureVersion: null,
    })
  })

  it('throws on PostgREST error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getAiUserSettings(USER)).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('setInAppAiEnabled', () => {
  it('upserts enabled=true with current disclosure_version', async () => {
    // get current (missing → defaults)
    maybeSingle.mockResolvedValue({ data: null, error: null })
    single.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: true,
        disclosure_version: AI_DISCLOSURE_VERSION,
        share_memo_with_ai: true,
        updated_at: '2026-07-12T01:00:00Z',
      },
      error: null,
    })

    const result = await setInAppAiEnabled(USER, true)

    expect(result.inAppAiEnabled).toBe(true)
    expect(result.disclosureVersion).toBe(AI_DISCLOSURE_VERSION)
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: USER,
        in_app_ai_enabled: true,
        share_memo_with_ai: true,
        disclosure_version: AI_DISCLOSURE_VERSION,
      },
      { onConflict: 'user_id' },
    )
  })

  it('upserts enabled=false (opt-out) preserving share_memo_with_ai without stamping version', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: true,
        disclosure_version: AI_DISCLOSURE_VERSION,
        share_memo_with_ai: false,
        updated_at: '2026-07-12T00:00:00Z',
      },
      error: null,
    })
    single.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: false,
        disclosure_version: AI_DISCLOSURE_VERSION,
        share_memo_with_ai: false,
        updated_at: '2026-07-12T02:00:00Z',
      },
      error: null,
    })

    const result = await setInAppAiEnabled(USER, false)

    expect(result.inAppAiEnabled).toBe(false)
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: USER,
        in_app_ai_enabled: false,
        share_memo_with_ai: false,
      },
      { onConflict: 'user_id' },
    )
  })
})
