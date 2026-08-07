import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AiSettingsProvider } from '../../ai/AiSettingsProvider'
import type { AiGatewayOkResponse, PeriodExplainInput, PeriodExplainResult } from '../../ai/types'
import { AuthContext, type AuthValue } from '../../auth/authContext'
import type { AiUserSettings } from '../../data/aiSettings'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../data/aiSettings', () => ({
  getAiUserSettings: vi.fn(),
}))
vi.mock('../../ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/client')>()
  return { ...actual, invokeAiFeature: vi.fn() }
})

import { AiClientError, invokeAiFeature } from '../../ai/client'
import { getAiUserSettings } from '../../data/aiSettings'
import { AiPeriodExplainCard } from './AiPeriodExplainCard'

const mockedInvoke = vi.mocked(invokeAiFeature)
const mockedSettings = vi.mocked(getAiUserSettings)

const USER_ID = 'user-1'
const LEDGER_ID = 'ledger-1'

const INPUT: PeriodExplainInput = {
  periodKey: '3m:2026-03_2026-05',
  months: [
    {
      month: '2026-03',
      income: 3000000,
      expense: 1500000,
      saving: 500000,
      investment: 300000,
      balance: 700000,
    },
    {
      month: '2026-04',
      income: 3200000,
      expense: 1600000,
      saving: 600000,
      investment: 300000,
      balance: 700000,
    },
    {
      month: '2026-05',
      income: 3100000,
      expense: 1400000,
      saving: 500000,
      investment: 300000,
      balance: 900000,
    },
  ],
  topCategories: [{ name: '식비', amount: 800000, pct: 50 }],
}

function aiSettings(enabled: boolean): AiUserSettings {
  return { userId: USER_ID, inAppAiEnabled: enabled, shareMemoWithAi: true, updatedAt: null }
}

function okResponse(
  result: PeriodExplainResult,
  cached = false,
): AiGatewayOkResponse<PeriodExplainResult> {
  return {
    ok: true,
    feature: 'period_explain',
    result,
    model: 'grok-4.5',
    usage: { promptTokens: 200, completionTokens: 60 },
    quota: { remainingDaily: 9, remainingMonthly: 39 },
    cached,
  }
}

function renderCard(ready = true, input: PeriodExplainInput = INPUT) {
  const auth: AuthValue = {
    status: 'authed',
    user: { id: USER_ID } as AuthValue['user'],
    session: null,
    signIn: async () => ({}),
    signUp: async () => ({}),
    signOut: async () => {},
  }
  return render(
    <AuthContext.Provider value={auth}>
      <AiSettingsProvider>
        <AiPeriodExplainCard ledgerId={LEDGER_ID} input={input} ready={ready} />
      </AiSettingsProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSettings.mockResolvedValue(aiSettings(true))
})

describe('AiPeriodExplainCard (S08 / PR-9)', () => {
  it('renders nothing and never invokes gateway when opted out', async () => {
    mockedSettings.mockResolvedValue(aiSettings(false))
    renderCard(true)

    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByText('AI 기간 해설')).not.toBeInTheDocument()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('renders nothing and never invokes gateway when ready is false', async () => {
    renderCard(false)

    // Give microtasks time to run
    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByText('AI 기간 해설')).not.toBeInTheDocument()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('renders nothing and never invokes gateway when months is empty', async () => {
    renderCard(true, { periodKey: '3m:_', months: [] })

    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByText('AI 기간 해설')).not.toBeInTheDocument()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('shows LLM bullets and sends input with dataVersionHash when ready', async () => {
    mockedInvoke.mockResolvedValue(
      okResponse({
        bullets: [
          '최근 3개월간 지출 비중이 가장 높은 항목은 식비입니다.',
          '5월 수지가 ₩900,000으로 가장 높습니다.',
        ],
        periodKey: '3m:2026-03_2026-05',
      }),
    )
    renderCard(true)

    await screen.findByText('최근 3개월간 지출 비중이 가장 높은 항목은 식비입니다.')
    expect(screen.getByText(/5월 수지가 ₩900,000으로 가장 높습니다\./)).toBeInTheDocument()
    expect(mockedInvoke).toHaveBeenCalledWith({
      feature: 'period_explain',
      ledgerId: LEDGER_ID,
      input: INPUT,
      dataVersionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('hides quietly on flag_off', async () => {
    mockedInvoke.mockRejectedValue(new AiClientError('flag_off'))
    renderCard(true)

    await waitFor(() => expect(mockedInvoke).toHaveBeenCalled())
    await waitFor(() => {
      expect(screen.queryByText('AI 기간 해설')).not.toBeInTheDocument()
    })
  })

  it('rejects a response with periodKey mismatch', async () => {
    mockedInvoke.mockResolvedValue(
      okResponse({
        bullets: ['불릿1', '불릿2'],
        periodKey: '6m:2026-01_2026-06',
      }),
    )
    renderCard(true)

    await screen.findByText('응답이 요청한 기간과 일치하지 않습니다.')
    expect(screen.queryByText('불릿1')).not.toBeInTheDocument()
  })

  it('re-invokes gateway when 다시 생성 is clicked', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValue(
      okResponse({
        bullets: ['불릿1', '불릿2'],
        periodKey: '3m:2026-03_2026-05',
      }),
    )
    renderCard(true)

    await screen.findByText('불릿1')
    expect(mockedInvoke).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('다시 생성'))
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2))
  })
})
