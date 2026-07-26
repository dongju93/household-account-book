import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import type { MonthCloseReviewData } from '../../ai/loadMonthCloseForNarrative'
import type { AiGatewayOkResponse, MonthCloseNarrativeResult } from '../../ai/types'
import { AuthContext, type AuthValue } from '../../auth/authContext'
import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import type { AiUserSettings } from '../../data/aiSettings'
import { MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON } from '../../domain/monthClose'
import { addMonths, currentYearMonth, monthKey } from '../../lib/month'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../data/aiSettings', () => ({ getAiUserSettings: vi.fn() }))
vi.mock('../../ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/client')>()
  return { ...actual, invokeAiFeature: vi.fn() }
})
vi.mock('../../ai/loadMonthCloseForNarrative', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/loadMonthCloseForNarrative')>()
  return { ...actual, loadMonthCloseForNarrative: vi.fn() }
})

import { AiClientError, invokeAiFeature } from '../../ai/client'
import { loadMonthCloseForNarrative } from '../../ai/loadMonthCloseForNarrative'
import { getAiUserSettings } from '../../data/aiSettings'
import { MonthCloseSection } from './MonthCloseSection'

const mockedInvoke = vi.mocked(invokeAiFeature)
const mockedLoad = vi.mocked(loadMonthCloseForNarrative)
const mockedSettings = vi.mocked(getAiUserSettings)

const USER_ID = 'user-1'
const LEDGER_ID = 'ledger-1'
const PAST = addMonths(currentYearMonth(), -1)
const PAST_KEY = monthKey(PAST.year, PAST.month)

const REVIEW: MonthCloseReviewData = {
  month: PAST_KEY,
  needsCheck: [
    {
      kind: 'over_budget',
      label: '식비 예산 5만 원 초과',
      nav: { month: PAST_KEY, categoryId: 'food' },
    },
  ],
  forReference: [
    { kind: 'under_saving_goal', label: '비상금 목표 미달', nav: { month: PAST_KEY } },
  ],
  noIssueSummary: { categoriesChecked: 2, transactionsChecked: 10 },
  truncated: false,
}

const EMPTY_REVIEW: MonthCloseReviewData = {
  month: PAST_KEY,
  needsCheck: [],
  forReference: [],
  noIssueSummary: { categoriesChecked: 2, transactionsChecked: 10 },
  truncated: false,
}

function aiSettings(enabled: boolean): AiUserSettings {
  return { userId: USER_ID, inAppAiEnabled: enabled, shareMemoWithAi: true, updatedAt: null }
}

function okResponse(
  result: MonthCloseNarrativeResult,
  cached = false,
): AiGatewayOkResponse<MonthCloseNarrativeResult> {
  return {
    ok: true,
    feature: 'month_close_narrative',
    result,
    model: 'grok-4.5',
    usage: { promptTokens: 200, completionTokens: 60 },
    quota: { remainingDaily: 4, remainingMonthly: 19 },
    cached,
  }
}

function renderSection(ym = PAST, { canEdit = true }: { canEdit?: boolean } = {}) {
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
    ledgerId: LEDGER_ID,
    ledgerName: '테스트',
    role: canEdit ? 'owner' : 'viewer',
    canEdit,
    canManage: canEdit,
    reload: () => {},
  }
  return render(
    <AuthContext.Provider value={auth}>
      <LedgerContext.Provider value={ledger}>
        <MonthCloseSection ledgerId={LEDGER_ID} ym={ym} />
      </LedgerContext.Provider>
    </AuthContext.Provider>,
  )
}

async function expandSection(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByText('월 마감 점검'))
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSettings.mockResolvedValue(aiSettings(true))
  mockedLoad.mockResolvedValue(REVIEW)
})

describe('MonthCloseSection (S07 / PR-7)', () => {
  it('renders nothing for the in-progress month', async () => {
    renderSection(currentYearMonth())
    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByText('월 마감 점검')).not.toBeInTheDocument()
    expect(mockedLoad).not.toHaveBeenCalled()
  })

  it('renders nothing and never loads when opted out', async () => {
    mockedSettings.mockResolvedValue(aiSettings(false))
    renderSection()
    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByText('월 마감 점검')).not.toBeInTheDocument()
    expect(mockedLoad).not.toHaveBeenCalled()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('starts collapsed: no loader call until expanded', async () => {
    const user = userEvent.setup()
    renderSection()

    await screen.findByText('월 마감 점검')
    expect(mockedLoad).not.toHaveBeenCalled()

    await expandSection(user)
    await waitFor(() => expect(mockedLoad).toHaveBeenCalledWith(LEDGER_ID, PAST, { canEdit: true }))
  })

  it('surfaces the incomplete-materialize reason for viewers (no narrative call)', async () => {
    const user = userEvent.setup()
    mockedLoad.mockRejectedValue(new Error(MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON))
    renderSection(PAST, { canEdit: false })

    await expandSection(user)

    await screen.findByText(MONTH_CLOSE_MATERIALIZE_INCOMPLETE_REASON)
    expect(mockedInvoke).not.toHaveBeenCalled()
    expect(mockedLoad).toHaveBeenCalledWith(LEDGER_ID, PAST, { canEdit: false })
  })

  it('never calls the gateway while the review loader is still pending (ready gate)', async () => {
    const user = userEvent.setup()
    mockedLoad.mockReturnValue(new Promise(() => {}))
    renderSection()

    await expandSection(user)

    // The pending state is now a layout-shaped skeleton (redesign §7.1), so the
    // loading message lives on the region's accessible name rather than in a
    // visible paragraph. Querying by role+name keeps asserting what matters:
    // the user is told it is loading, and no gateway call has gone out.
    await screen.findByRole('status', { name: '점검 데이터를 불러오는 중…' })
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('sends findings only (kind/label, no nav) with a dataVersionHash, then renders narrative + rows', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValue(
      okResponse({
        summary:
          '이번 마감은 식비 초과 내역을 먼저 구분한 뒤 비상금 실행 계획을 확정하는 것이 핵심입니다.',
        actions: [
          '식비 내역을 반복 지출과 일회성 지출로 나누어 보고, 다음 달 시작 전에 지출 규칙 또는 예산 조정 여부를 확정하세요.',
        ],
        groundedMonth: PAST_KEY,
      }),
    )
    renderSection()

    await expandSection(user)

    await screen.findByText(
      '이번 마감은 식비 초과 내역을 먼저 구분한 뒤 비상금 실행 계획을 확정하는 것이 핵심입니다.',
    )
    expect(
      screen.getByText(
        '식비 내역을 반복 지출과 일회성 지출로 나누어 보고, 다음 달 시작 전에 지출 규칙 또는 예산 조정 여부를 확정하세요.',
      ),
    ).toBeInTheDocument()
    expect(screen.getByText('AI가 제안한 마감 순서')).toBeInTheDocument()
    expect(screen.getByText('식비 예산 5만 원 초과')).toBeInTheDocument()
    expect(screen.getByText('비상금 목표 미달')).toBeInTheDocument()
    expect(mockedInvoke).toHaveBeenCalledWith({
      feature: 'month_close_narrative',
      ledgerId: LEDGER_ID,
      input: {
        month: PAST_KEY,
        needsCheck: [{ kind: 'over_budget', label: '식비 예산 5만 원 초과' }],
        forReference: [{ kind: 'under_saving_goal', label: '비상금 목표 미달' }],
        truncated: false,
      },
      dataVersionHash: expect.stringMatching(/^[0-9a-f]{64}$/),
    })
  })

  it('rejects a narrative grounded to a different month', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValue(
      okResponse({
        summary: '이번 마감에서 먼저 확인할 항목과 다음 달에 조정할 항목을 순서대로 정리했습니다.',
        actions: ['식비 내역을 확인한 뒤 다음 달 시작 전에 지출 규칙을 하나 정하면 완료입니다.'],
        groundedMonth: '2020-01',
      }),
    )
    renderSection()

    await expandSection(user)

    await screen.findByText('응답이 요청한 월과 일치하지 않습니다.')
    expect(
      screen.queryByText(
        '이번 마감에서 먼저 확인할 항목과 다음 달에 조정할 항목을 순서대로 정리했습니다.',
      ),
    ).not.toBeInTheDocument()
  })

  it('keeps domain finding rows but hides the narrative quietly on flag_off', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockRejectedValue(new AiClientError('flag_off'))
    renderSection()

    await expandSection(user)

    await screen.findByText('식비 예산 5만 원 초과')
    expect(screen.queryByText('다시 생성')).not.toBeInTheDocument()
    expect(screen.queryByText(/일시적으로 사용할 수 없습니다/)).not.toBeInTheDocument()
  })

  it('short-circuits to a domain no-issue line without any gateway call', async () => {
    const user = userEvent.setup()
    mockedLoad.mockResolvedValue(EMPTY_REVIEW)
    renderSection()

    await expandSection(user)

    await screen.findByText(/특이사항이 없습니다/)
    expect(screen.getByText(/거래 10건 점검/)).toBeInTheDocument()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })
})
