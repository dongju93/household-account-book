import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { AiGatewayOkResponse, MonthInsightInput, MonthInsightResult } from '../../ai/types'
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
import { AiInsightCard } from './AiInsightCard'

const mockedInvoke = vi.mocked(invokeAiFeature)
const mockedSettings = vi.mocked(getAiUserSettings)

const USER_ID = 'user-1'
const LEDGER_ID = 'ledger-1'

const INPUT: MonthInsightInput = {
  month: '2026-07',
  summary: {
    totalIncome: 3_000_000,
    totalExpense: 1_200_000,
    totalSaving: 500_000,
    totalInvestment: 0,
    balance: 1_300_000,
  },
  achievements: [],
  topExpenses: [{ name: '식비', amount: 400_000, pct: 33 }],
}

const TIPS = ['예산 초과 카테고리 1개 (최대 초과: 식비).']

function aiSettings(enabled: boolean): AiUserSettings {
  return { userId: USER_ID, inAppAiEnabled: enabled, shareMemoWithAi: true, updatedAt: null }
}

function okResponse(
  result: MonthInsightResult,
  cached = false,
): AiGatewayOkResponse<MonthInsightResult> {
  return {
    ok: true,
    feature: 'month_insight',
    result,
    model: 'grok-4.3',
    usage: { promptTokens: 200, completionTokens: 60 },
    quota: { remainingDaily: 9, remainingMonthly: 39 },
    cached,
  }
}

function renderCard(tips: readonly string[] = TIPS) {
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
      <AiInsightCard ledgerId={LEDGER_ID} input={INPUT} tips={tips} />
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSettings.mockResolvedValue(aiSettings(true))
})

describe('AiInsightCard (S06 / PR-6)', () => {
  it('renders nothing and never invokes the gateway when opted out', async () => {
    mockedSettings.mockResolvedValue(aiSettings(false))
    renderCard()
    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByText('AI 인사이트')).not.toBeInTheDocument()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('shows LLM bullets and sends aggregates with a dataVersionHash', async () => {
    mockedInvoke.mockResolvedValue(
      okResponse({
        bullets: ['이번 달 수지는 +130만 원입니다.', '지출의 33%가 식비입니다.'],
        groundedMonth: '2026-07',
      }),
    )
    renderCard()

    await screen.findByText('이번 달 수지는 +130만 원입니다.')
    expect(screen.getByText(/지출의 33%가 식비입니다\./)).toBeInTheDocument()
    expect(mockedInvoke).toHaveBeenCalledWith({
      feature: 'month_insight',
      ledgerId: LEDGER_ID,
      input: INPUT,
      dataVersionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('keeps template tips but hides AI bullets quietly on flag_off', async () => {
    mockedInvoke.mockRejectedValue(new AiClientError('flag_off'))
    renderCard()

    await screen.findByText(TIPS[0])
    expect(screen.queryByText('다시 생성')).not.toBeInTheDocument()
    expect(screen.queryByText(/인사이트 생성 중/)).not.toBeInTheDocument()
    expect(screen.queryByText(/일시적으로 사용할 수 없습니다/)).not.toBeInTheDocument()
  })

  it('shows the error message but keeps tips on quota/upstream failures', async () => {
    mockedInvoke.mockRejectedValue(new AiClientError('quota_exceeded'))
    renderCard()

    await screen.findByText('이번 달 AI 이용 한도를 모두 사용했습니다.')
    expect(screen.getByText(TIPS[0])).toBeInTheDocument()
  })

  it('re-invokes on 다시 생성 (cache decides whether quota is spent)', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValue(
      okResponse({ bullets: ['불릿1', '불릿2'], groundedMonth: '2026-07' }, true),
    )
    renderCard()

    await screen.findByText('불릿1')
    expect(mockedInvoke).toHaveBeenCalledTimes(1)
    await user.click(screen.getByText('다시 생성'))
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2))
  })

  it('rejects a response grounded to a different month', async () => {
    mockedInvoke.mockResolvedValue(
      okResponse({ bullets: ['불릿1', '불릿2'], groundedMonth: '2026-06' }),
    )
    renderCard()

    await screen.findByText('응답이 요청한 월과 일치하지 않습니다.')
    expect(screen.queryByText('불릿1')).not.toBeInTheDocument()
  })
})
