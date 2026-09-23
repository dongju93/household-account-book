import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AiSettingsProvider } from '../../ai/AiSettingsProvider'
import {
  AI_DISCLOSURE_VERSION,
  AI_LIMITS,
  type AiGatewayOkResponse,
  type ChatSnapshot,
  type ChatTurnInput,
  type ChatTurnResult,
} from '../../ai/types'
import { RefreshProvider } from '../../app/refresh'
import { useRefresh } from '../../app/useRefresh'
import { AuthContext, type AuthValue } from '../../auth/authContext'
import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import type { AiUserSettings } from '../../data/aiSettings'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../data/aiSettings', () => ({ getAiUserSettings: vi.fn() }))
vi.mock('../../ai/loadChatSnapshot', () => ({ loadChatSnapshot: vi.fn() }))
vi.mock('../../ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/client')>()
  return { ...actual, invokeAiFeature: vi.fn() }
})
// Every ledger write path, mocked so the acceptance test can prove none of them
// is reachable from a chat turn (docs/4-1 S12 "ledger write 경로 없음").
vi.mock('../../data/transactions', () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  deleteTransaction: vi.fn(),
}))
vi.mock('../../data/summary', () => ({
  materializeMonth: vi.fn(),
  materializeMonths: vi.fn(),
  fetchTransactionsInRange: vi.fn(),
}))

import { AiClientError, invokeAiFeature } from '../../ai/client'
import { loadChatSnapshot } from '../../ai/loadChatSnapshot'
import { getAiUserSettings } from '../../data/aiSettings'
import { materializeMonth, materializeMonths } from '../../data/summary'
import { createTransaction, deleteTransaction, updateTransaction } from '../../data/transactions'
import { ChatLauncher } from './ChatLauncher'
import { CHAT_SURFACE_LABEL, CHAT_UNAVAILABLE_MESSAGE, ChatSheet } from './ChatSheet'

const mockedInvoke = vi.mocked(invokeAiFeature)
const mockedSettings = vi.mocked(getAiUserSettings)
const mockedSnapshot = vi.mocked(loadChatSnapshot)

const USER_ID = 'user-1'
const LEDGER_ID = 'ledger-1'

const SNAPSHOT: ChatSnapshot = {
  today: '2026-09-19',
  currentMonth: '2026-09',
  months: [
    {
      month: '2026-08',
      income: 3_000_000,
      expense: 1_800_000,
      saving: 300_000,
      investment: 0,
      balance: 900_000,
      topExpenses: [{ name: '식비', amount: 700_000, pct: 39 }],
    },
    {
      month: '2026-09',
      income: 3_000_000,
      expense: 400_000,
      saving: 0,
      investment: 0,
      balance: 2_600_000,
      topExpenses: [{ name: '식비', amount: 200_000, pct: 50 }],
    },
  ],
  achievements: [
    { name: '식비', type: 'expense', target: 500_000, actual: 200_000, status: '정상' },
  ],
  categoryChanges: [],
  truncated: false,
}

function aiSettings(enabled: boolean): AiUserSettings {
  return {
    userId: USER_ID,
    inAppAiEnabled: enabled,
    disclosureVersion: enabled ? AI_DISCLOSURE_VERSION : null,
    shareMemoWithAi: true,
    updatedAt: null,
  }
}

function okResponse(reply: string): AiGatewayOkResponse<ChatTurnResult> {
  return {
    ok: true,
    feature: 'chat_turn',
    result: { reply },
    model: 'gpt-5.6-luna',
    usage: { promptTokens: 300, completionTokens: 40 },
    quota: { remainingDaily: 9, remainingMonthly: 59 },
    cached: false,
  }
}

function Harness({ hidden = false, onUnavailable = () => {} }) {
  // Stands in for any mutation elsewhere in the app bumping `version`.
  const { refresh } = useRefresh()
  return (
    <>
      <button type="button" onClick={refresh}>
        refresh
      </button>
      <ChatLauncher hidden={hidden} onOpen={() => {}} />
      <ChatSheet open onClose={() => {}} onUnavailable={onUnavailable} />
    </>
  )
}

function renderChat(props: { hidden?: boolean; onUnavailable?: () => void } = {}) {
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
    ledgerName: '테스트 가계부',
    role: 'viewer',
    canEdit: false,
    canManage: false,
    reload: () => {},
  }
  return render(
    <AuthContext.Provider value={auth}>
      <LedgerContext.Provider value={ledger}>
        <RefreshProvider>
          <AiSettingsProvider>
            <Harness {...props} />
          </AiSettingsProvider>
        </RefreshProvider>
      </LedgerContext.Provider>
    </AuthContext.Provider>,
  )
}

const LAUNCHER = { name: `${CHAT_SURFACE_LABEL}에게 묻기` }

beforeEach(() => {
  vi.clearAllMocks()
  mockedSettings.mockResolvedValue(aiSettings(true))
  mockedSnapshot.mockResolvedValue(SNAPSHOT)
})

describe('ChatSheet + ChatLauncher (S12 / PR-13)', () => {
  it('옵트아웃: 진입 버튼·시트 모두 렌더되지 않고 스냅샷·게이트웨이 호출도 없다', async () => {
    mockedSettings.mockResolvedValue(aiSettings(false))
    renderChat()

    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByRole('button', LAUNCHER)).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', LAUNCHER)).not.toBeInTheDocument()
    expect(mockedSnapshot).not.toHaveBeenCalled()
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('한 턴: 스냅샷 + 사용자 메시지(마지막 role=user, ≤8KiB)만 chat_turn으로 보내고 답변을 렌더한다; 원장 쓰기 경로 호출 없음', async () => {
    mockedInvoke.mockResolvedValue(okResponse('8월 식비는 ₩700,000으로 9월보다 많았습니다.'))
    renderChat()

    // Launcher is available for opted-in members (viewer is enough — read-only).
    expect(await screen.findByRole('button', LAUNCHER)).toBeInTheDocument()
    const box = await screen.findByLabelText('질문')
    await waitFor(() => expect(box).toBeEnabled())

    await userEvent.type(box, '식비 많이 쓴 달?')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))

    expect(
      await screen.findByText('8월 식비는 ₩700,000으로 9월보다 많았습니다.'),
    ).toBeInTheDocument()
    expect(screen.getByText('식비 많이 쓴 달?')).toBeInTheDocument()

    expect(mockedInvoke).toHaveBeenCalledTimes(1)
    const body = mockedInvoke.mock.calls[0][0]
    expect(body.feature).toBe('chat_turn')
    expect(body.ledgerId).toBe(LEDGER_ID)
    expect(body.dataVersionHash).toBeUndefined()
    const input = body.input as ChatTurnInput
    expect(input.messages).toEqual([{ role: 'user', content: '식비 많이 쓴 달?' }])
    expect(input.context).toEqual(SNAPSHOT)
    expect(new TextEncoder().encode(JSON.stringify(input.context)).length).toBeLessThanOrEqual(
      AI_LIMITS.chatTurn.contextMaxBytes,
    )

    // Read-only invariant: nothing but the gateway was called.
    expect(createTransaction).not.toHaveBeenCalled()
    expect(updateTransaction).not.toHaveBeenCalled()
    expect(deleteTransaction).not.toHaveBeenCalled()
    expect(materializeMonth).not.toHaveBeenCalled()
    expect(materializeMonths).not.toHaveBeenCalled()
    // The snapshot is loaded once per open, not once per turn.
    expect(mockedSnapshot).toHaveBeenCalledTimes(1)
  })

  it('두 번째 턴은 이전 대화를 이어 보내며 history는 12개 이내로 유지된다', async () => {
    mockedInvoke.mockResolvedValue(okResponse('네.'))
    renderChat()
    const box = await screen.findByLabelText('질문')
    await waitFor(() => expect(box).toBeEnabled())

    for (let i = 0; i < 8; i++) {
      await userEvent.type(box, `질문${i}`)
      await userEvent.click(screen.getByRole('button', { name: '보내기' }))
      await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(i + 1))
      await waitFor(() => expect(box).toBeEnabled())
    }

    const last = mockedInvoke.mock.calls.at(-1)![0].input as ChatTurnInput
    expect(last.messages.length).toBeLessThanOrEqual(AI_LIMITS.chatTurn.messagesMax)
    expect(last.messages.at(-1)).toEqual({ role: 'user', content: '질문7' })
    expect(last.messages.at(-2)).toEqual({ role: 'assistant', content: '네.' })
  })

  it('replyMax까지 긴 답변도 전부 보여 주되, 다음 턴에는 contentMax 이내로 잘라 보내 대화가 깨지지 않는다', async () => {
    const longReply = '가'.repeat(AI_LIMITS.chatTurn.replyMax)
    mockedInvoke.mockResolvedValueOnce(okResponse(longReply)).mockResolvedValue(okResponse('네.'))
    renderChat()
    const box = await screen.findByLabelText('질문')
    await waitFor(() => expect(box).toBeEnabled())

    await userEvent.type(box, '질문1')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(await screen.findByText(longReply)).toBeInTheDocument()
    await waitFor(() => expect(box).toBeEnabled())

    await userEvent.type(box, '질문2')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(2))

    const second = mockedInvoke.mock.calls[1][0].input as ChatTurnInput
    for (const m of second.messages) {
      expect(m.content.length).toBeLessThanOrEqual(AI_LIMITS.chatTurn.contentMax)
    }
    expect(second.messages.at(-1)).toEqual({ role: 'user', content: '질문2' })
    // The on-screen history still holds the full reply after the next turn.
    expect(await screen.findByText('네.')).toBeInTheDocument()
    expect(screen.getByText(longReply)).toBeInTheDocument()
  })

  it('flag_off: 시트를 잠그고 onUnavailable로 진입 버튼을 숨긴다 (재전송 불가)', async () => {
    mockedInvoke.mockRejectedValue(new AiClientError('flag_off', CHAT_UNAVAILABLE_MESSAGE))
    const onUnavailable = vi.fn()
    renderChat({ onUnavailable })
    const box = await screen.findByLabelText('질문')
    await waitFor(() => expect(box).toBeEnabled())

    await userEvent.type(box, '안녕')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))

    expect(await screen.findByRole('status')).toHaveTextContent(CHAT_UNAVAILABLE_MESSAGE)
    expect(onUnavailable).toHaveBeenCalledTimes(1)
    expect(screen.queryByLabelText('질문')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: '보내기' })).not.toBeInTheDocument()
  })

  it('hidden=true면 진입 버튼이 사라진다 (레이아웃이 flag_off 이후 유지하는 세션 상태)', async () => {
    renderChat({ hidden: true })
    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByRole('button', LAUNCHER)).not.toBeInTheDocument()
  })

  it('스냅샷 재집계 중에는 전송이 막히고, 재개된 턴은 이전이 아닌 새 스냅샷을 보낸다', async () => {
    mockedInvoke.mockResolvedValue(okResponse('네.'))
    renderChat()
    const box = await screen.findByLabelText('질문')
    await waitFor(() => expect(box).toBeEnabled())
    await userEvent.type(box, '이번 달 수지?')
    expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled()

    // A mutation bumps `version`; the re-fetch stays pending until we resolve it.
    const fresh: ChatSnapshot = { ...SNAPSHOT, today: '2026-09-20' }
    let resolveFresh!: (s: ChatSnapshot) => void
    mockedSnapshot.mockImplementationOnce(
      () =>
        new Promise<ChatSnapshot>((r) => {
          resolveFresh = r
        }),
    )
    await userEvent.click(screen.getByRole('button', { name: 'refresh' }))

    // useAsyncData still holds the old snapshot here — sending must be gated on
    // the loading state, not on `data` being non-null.
    expect(await screen.findByRole('status', { name: '집계 준비 중…' })).toBeInTheDocument()
    expect(box).toBeDisabled()
    expect(screen.getByRole('button', { name: '보내기' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    expect(mockedInvoke).not.toHaveBeenCalled()
    // The draft survives the refresh so nothing has to be retyped.
    expect(box).toHaveValue('이번 달 수지?')

    resolveFresh(fresh)
    await waitFor(() => expect(box).toBeEnabled())
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))
    await waitFor(() => expect(mockedInvoke).toHaveBeenCalledTimes(1))
    const input = mockedInvoke.mock.calls[0][0].input as ChatTurnInput
    expect(input.context).toEqual(fresh)
  })

  it('quota_exceeded 등 다른 오류는 메시지를 롤백하고 입력을 되돌려 재시도할 수 있게 한다', async () => {
    mockedInvoke.mockRejectedValueOnce(
      new AiClientError('quota_exceeded', '오늘(한국 시간) AI 이용 한도를 모두 사용했습니다.'),
    )
    renderChat()
    const box = await screen.findByLabelText('질문')
    await waitFor(() => expect(box).toBeEnabled())

    await userEvent.type(box, '이번 달 수지?')
    await userEvent.click(screen.getByRole('button', { name: '보내기' }))

    expect(
      await screen.findByText('오늘(한국 시간) AI 이용 한도를 모두 사용했습니다.'),
    ).toBeInTheDocument()
    expect(box).toHaveValue('이번 달 수지?')
    expect(screen.queryByRole('list', { name: '대화' })).not.toBeInTheDocument()
    // Still usable — the chat flag was not the cause.
    expect(screen.getByRole('button', { name: '보내기' })).toBeEnabled()
  })
})
