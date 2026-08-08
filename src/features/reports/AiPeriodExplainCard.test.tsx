import { act, render, screen, waitFor } from '@testing-library/react'
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
  progress: { asOf: '2026-05-20', dayOfMonth: 20, daysInMonth: 31 },
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
  categoryChanges: [
    {
      name: '식비',
      previousAmount: 600000,
      latestAmount: 500000,
      delta: -100000,
      deltaPct: -17,
    },
  ],
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

function tree(ready: boolean, input: PeriodExplainInput = INPUT) {
  const auth: AuthValue = {
    status: 'authed',
    user: { id: USER_ID } as AuthValue['user'],
    session: null,
    signIn: async () => ({}),
    signUp: async () => ({}),
    signOut: async () => {},
  }
  return (
    <AuthContext.Provider value={auth}>
      <AiSettingsProvider>
        <AiPeriodExplainCard ledgerId={LEDGER_ID} input={input} ready={ready} />
      </AiSettingsProvider>
    </AuthContext.Provider>
  )
}

function renderCard(ready = true, input: PeriodExplainInput = INPUT) {
  return render(tree(ready, input))
}

const LOADING = { name: '기간 해설 생성 중…' }

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

  it('shows the LLM interpretation and advice and sends input with dataVersionHash', async () => {
    mockedInvoke.mockResolvedValue(
      okResponse({
        bullets: [
          '5월에는 지출이 낮아진 흐름과 수지가 높아진 흐름이 함께 나타났지만, 같은 변화가 반복될지는 아직 확인이 필요합니다.',
          '식비의 최근 거래를 반복 지출과 일회성 지출로 나눠 감소 원인을 확인하고, 다음 달에도 적용할 지출 규칙 하나를 정하면 완료입니다.',
        ],
        periodKey: '3m:2026-03_2026-05',
      }),
    )
    renderCard(true)

    await screen.findByText(/5월에는 지출이 낮아진 흐름과 수지가 높아진 흐름/)
    expect(
      screen.getByText(/식비의 최근 거래를 반복 지출과 일회성 지출로 나눠/),
    ).toBeInTheDocument()
    expect(screen.getByText('핵심 해석')).toBeInTheDocument()
    expect(screen.getByText('다음 행동')).toBeInTheDocument()
    expect(mockedInvoke).toHaveBeenCalledWith({
      feature: 'period_explain',
      ledgerId: LEDGER_ID,
      input: INPUT,
      dataVersionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('shows the loading skeleton while the first request is in flight', async () => {
    let settle!: (res: AiGatewayOkResponse<PeriodExplainResult>) => void
    mockedInvoke.mockReturnValue(
      new Promise<AiGatewayOkResponse<PeriodExplainResult>>((resolve) => {
        settle = resolve
      }),
    )
    renderCard(true)

    // No prior result exists, so the card must still announce progress rather
    // than staying absent until the provider answers.
    await screen.findByRole('status', LOADING)

    settle(
      okResponse({
        bullets: ['해석1', '조언1'],
        periodKey: '3m:2026-03_2026-05',
      }),
    )
    await screen.findByText('해석1')
    expect(screen.queryByRole('status', LOADING)).not.toBeInTheDocument()
  })

  it('shows the loading skeleton again after ready drops and returns', async () => {
    mockedInvoke.mockResolvedValue(
      okResponse({
        bullets: ['해석1', '조언1'],
        periodKey: '3m:2026-03_2026-05',
      }),
    )
    const { rerender } = renderCard(true)
    await screen.findByText('해석1')

    let settle!: (res: AiGatewayOkResponse<PeriodExplainResult>) => void
    mockedInvoke.mockReturnValue(
      new Promise<AiGatewayOkResponse<PeriodExplainResult>>((resolve) => {
        settle = resolve
      }),
    )
    // A period switch re-fetches the report, so `ready` dips false and back.
    // The dip lasts a real network round-trip, so let the inactive run settle
    // before it returns — that resolution is what used to clobber the state.
    rerender(tree(false))
    await act(async () => {})
    rerender(tree(true))

    await screen.findByRole('status', LOADING)
    settle(
      okResponse({
        bullets: ['해석2', '조언2'],
        periodKey: '3m:2026-03_2026-05',
      }),
    )
    await screen.findByText('해석2')
  })

  it('stays hidden across a ready dip once flag_off has been seen', async () => {
    mockedInvoke.mockRejectedValue(new AiClientError('flag_off'))
    const { rerender } = renderCard(true)
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalled())

    rerender(tree(false))
    await act(async () => {})
    rerender(tree(true))

    // The inactive run must not erase the hide, or the kill switch would flash
    // a skeleton card on every period switch.
    expect(screen.queryByRole('status', LOADING)).not.toBeInTheDocument()
    expect(screen.queryByText('AI 기간 해설')).not.toBeInTheDocument()
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
        bullets: ['해석1', '조언1'],
        periodKey: '6m:2026-01_2026-06',
      }),
    )
    renderCard(true)

    await screen.findByText('응답이 요청한 기간과 일치하지 않습니다.')
    expect(screen.queryByText('해석1')).not.toBeInTheDocument()
  })

  it('re-invokes gateway when 다시 생성 is clicked', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValue(
      okResponse({
        bullets: ['해석1', '조언1'],
        periodKey: '3m:2026-03_2026-05',
      }),
    )
    renderCard(true)

    await screen.findByText('해석1')
    expect(mockedInvoke).toHaveBeenCalledTimes(1)

    await user.click(screen.getByText('다시 생성'))
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2))
  })
})
