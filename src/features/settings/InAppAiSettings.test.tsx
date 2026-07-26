import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AuthContext, type AuthValue } from '../../auth/authContext'
import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import type { AiUserSettings } from '../../data/aiSettings'

vi.mock('../../data/aiSettings', () => ({
  getAiUserSettings: vi.fn(),
  setInAppAiEnabled: vi.fn(),
}))

import { getAiUserSettings, setInAppAiEnabled } from '../../data/aiSettings'
import { AI_DISCLOSURE, InAppAiSettings } from './InAppAiSettings'

const mockedGet = vi.mocked(getAiUserSettings)
const mockedSet = vi.mocked(setInAppAiEnabled)

const USER_ID = 'user-settings-1'

function settings(partial: Partial<AiUserSettings> = {}): AiUserSettings {
  return {
    userId: USER_ID,
    inAppAiEnabled: false,
    shareMemoWithAi: true,
    updatedAt: null,
    ...partial,
  }
}

function renderSettings() {
  const auth: AuthValue = {
    status: 'authed',
    user: { id: USER_ID } as AuthValue['user'],
    session: null,
    signIn: async () => ({}),
    signUp: async () => ({}),
    signOut: async () => {},
  }
  const ledger: LedgerValue = {
    status: 'ready',
    ledgerId: 'ledger-1',
    ledgerName: '테스트 가계부',
    role: 'owner',
    canEdit: true,
    canManage: true,
    reload: () => {},
  }
  return render(
    <AuthContext.Provider value={auth}>
      <LedgerContext.Provider value={ledger}>
        <InAppAiSettings />
      </LedgerContext.Provider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedGet.mockResolvedValue(settings({ inAppAiEnabled: false }))
  mockedSet.mockImplementation(async (_id, enabled) => settings({ inAppAiEnabled: enabled }))
})

describe('InAppAiSettings AI privacy gate (S04 / PR-8)', () => {
  it('shows overseas LLM disclosure copy (required even under public ON policy)', async () => {
    renderSettings()
    await waitFor(() => {
      expect(screen.getByText(AI_DISCLOSURE)).toBeInTheDocument()
    })
    // Residual quota UI must not appear in this PR (S13).
    expect(screen.queryByText(/잔여|한도|쿼터/)).not.toBeInTheDocument()
  })

  it('loads opt-out state and persists toggle on → off via setInAppAiEnabled', async () => {
    const user = userEvent.setup()
    mockedGet.mockResolvedValue(settings({ inAppAiEnabled: true }))
    renderSettings()

    const toggle = await screen.findByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'true')

    await user.click(toggle)

    await waitFor(() => {
      expect(mockedSet).toHaveBeenCalledWith(USER_ID, false)
    })
  })

  it('enables AI from dark-launch default (toggle off → on)', async () => {
    const user = userEvent.setup()
    renderSettings()

    const toggle = await screen.findByRole('switch')
    expect(toggle).toHaveAttribute('aria-checked', 'false')

    await user.click(toggle)

    await waitFor(() => {
      expect(mockedSet).toHaveBeenCalledWith(USER_ID, true)
    })
  })
})
