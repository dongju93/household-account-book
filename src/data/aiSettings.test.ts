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

import { defaultAiUserSettings, getAiUserSettings, setInAppAiEnabled } from './aiSettings'

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

describe('getAiUserSettings', () => {
  it('returns dark-launch defaults when no row exists', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null })

    await expect(getAiUserSettings(USER)).resolves.toEqual(defaultAiUserSettings(USER))
    expect(from).toHaveBeenCalledWith('ai_user_settings')
  })

  it('maps an existing row to camelCase', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: true,
        share_memo_with_ai: false,
        updated_at: '2026-07-12T00:00:00Z',
      },
      error: null,
    })

    await expect(getAiUserSettings(USER)).resolves.toEqual({
      userId: USER,
      inAppAiEnabled: true,
      shareMemoWithAi: false,
      updatedAt: '2026-07-12T00:00:00Z',
    })
  })

  it('throws on PostgREST error', async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: 'boom' } })
    await expect(getAiUserSettings(USER)).rejects.toMatchObject({ message: 'boom' })
  })
})

describe('setInAppAiEnabled', () => {
  it('upserts enabled=true and returns mapped row', async () => {
    // get current (missing → defaults)
    maybeSingle.mockResolvedValue({ data: null, error: null })
    single.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: true,
        share_memo_with_ai: true,
        updated_at: '2026-07-12T01:00:00Z',
      },
      error: null,
    })

    const result = await setInAppAiEnabled(USER, true)

    expect(result.inAppAiEnabled).toBe(true)
    expect(upsert).toHaveBeenCalledWith(
      {
        user_id: USER,
        in_app_ai_enabled: true,
        share_memo_with_ai: true,
      },
      { onConflict: 'user_id' },
    )
  })

  it('upserts enabled=false (opt-out) preserving share_memo_with_ai', async () => {
    maybeSingle.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: true,
        share_memo_with_ai: false,
        updated_at: '2026-07-12T00:00:00Z',
      },
      error: null,
    })
    single.mockResolvedValue({
      data: {
        user_id: USER,
        in_app_ai_enabled: false,
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
