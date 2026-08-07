import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { AiSettingsProvider } from '../../ai/AiSettingsProvider'
import type { AiGatewayOkResponse, NlTxnParseResult } from '../../ai/types'
import { AuthContext, type AuthValue } from '../../auth/authContext'
import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import type { AiUserSettings } from '../../data/aiSettings'
import type { Category } from '../../domain/types'

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../data/aiSettings', () => ({
  getAiUserSettings: vi.fn(),
}))
vi.mock('../../data/transactions', () => ({
  createTransaction: vi.fn(),
  updateTransaction: vi.fn(),
  fetchMemoHistory: vi.fn().mockResolvedValue([]),
  fetchNearDuplicateCandidates: vi.fn().mockResolvedValue([]),
}))
vi.mock('../../ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/client')>()
  return { ...actual, invokeAiFeature: vi.fn() }
})

import { invokeAiFeature } from '../../ai/client'
import { getAiUserSettings } from '../../data/aiSettings'
import {
  createTransaction,
  fetchMemoHistory,
  fetchNearDuplicateCandidates,
} from '../../data/transactions'
import type { Transaction } from '../../domain/types'
import { TransactionSheet } from './TransactionSheet'

const mockedInvoke = vi.mocked(invokeAiFeature)
const mockedSettings = vi.mocked(getAiUserSettings)
const mockedCreate = vi.mocked(createTransaction)
const mockedMemoHistory = vi.mocked(fetchMemoHistory)
const mockedNearDuplicates = vi.mocked(fetchNearDuplicateCandidates)

const USER_ID = 'user-1'
const LEDGER_ID = 'ledger-1'

const CATEGORIES: Category[] = [
  {
    id: 'c-food',
    ledgerId: LEDGER_ID,
    name: '식비',
    type: 'expense',
    icon: null,
    budgetAmount: null,
    goalAmount: null,
    sortOrder: 0,
    isActive: true,
    showBudgetPace: false,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
  },
]

function aiSettings(enabled: boolean): AiUserSettings {
  return { userId: USER_ID, inAppAiEnabled: enabled, shareMemoWithAi: true, updatedAt: null }
}

function okResponse(
  draft: NlTxnParseResult['draft'],
  warnings: string[] = [],
): AiGatewayOkResponse<NlTxnParseResult> {
  return {
    ok: true,
    feature: 'nl_txn_parse',
    result: { draft, confidence: 'high', warnings },
    model: 'grok-4.5',
    usage: { promptTokens: 100, completionTokens: 40 },
    quota: { remainingDaily: 39, remainingMonthly: 399 },
  }
}

function renderSheet({ canEdit = true }: { canEdit?: boolean } = {}) {
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
    role: canEdit ? 'editor' : 'viewer',
    canEdit,
    canManage: false,
    reload: () => {},
  }
  return render(
    <AuthContext.Provider value={auth}>
      <LedgerContext.Provider value={ledger}>
        <AiSettingsProvider>
          <TransactionSheet
            open
            onClose={() => {}}
            ledgerId={LEDGER_ID}
            transaction={null}
            categories={CATEGORIES}
            onSaved={() => {}}
          />
        </AiSettingsProvider>
      </LedgerContext.Provider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSettings.mockResolvedValue(aiSettings(true))
  mockedNearDuplicates.mockResolvedValue([])
})

describe('TransactionSheet NL draft field (S05 / PR-5)', () => {
  it('hides the NL field for viewers', async () => {
    renderSheet({ canEdit: false })
    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByLabelText('자연어로 입력')).not.toBeInTheDocument()
  })

  it('hides the NL field when in-app AI is opted out', async () => {
    mockedSettings.mockResolvedValue(aiSettings(false))
    renderSheet()
    await waitFor(() => expect(mockedSettings).toHaveBeenCalled())
    expect(screen.queryByLabelText('자연어로 입력')).not.toBeInTheDocument()
  })

  it('applies a parsed draft as prefill and saves only via createTransaction after confirm', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValue(
      okResponse({
        amount: 12000,
        type: 'expense',
        categoryName: '식비',
        date: '2026-07-19',
        memo: '점심',
      }),
    )
    mockedCreate.mockResolvedValue(undefined as never)
    renderSheet()

    const field = await screen.findByLabelText('자연어로 입력')
    await user.type(field, '어제 점심 1만2천원 식비')
    await user.click(screen.getByRole('button', { name: '적용' }))

    // Draft prefills the form; nothing is written yet.
    await screen.findByText('AI가 제안한 초안입니다. 내용을 확인한 뒤 저장해 주세요.')
    expect(screen.getByPlaceholderText('0')).toHaveValue('12000')
    expect(screen.getByDisplayValue('2026-07-19')).toBeInTheDocument()
    expect(screen.getByDisplayValue('점심')).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()

    expect(mockedInvoke).toHaveBeenCalledWith({
      feature: 'nl_txn_parse',
      ledgerId: LEDGER_ID,
      input: expect.objectContaining({
        text: '어제 점심 1만2천원 식비',
        categories: [{ id: 'c-food', name: '식비', type: 'expense' }],
      }),
    })

    // Confirming with 저장 goes through the existing createTransaction path.
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(LEDGER_ID, {
        categoryId: 'c-food',
        type: 'expense',
        txnDate: '2026-07-19',
        amount: 12000,
        memo: '점심',
      })
    })
  })

  it('shows a field warning for a non-integer amount and never saves silently', async () => {
    const user = userEvent.setup()
    mockedInvoke.mockResolvedValue(
      okResponse({
        amount: 4500.5,
        type: 'expense',
        categoryName: '식비',
        date: null,
        memo: null,
      }),
    )
    renderSheet()

    const field = await screen.findByLabelText('자연어로 입력')
    await user.type(field, '커피 4500.5원')
    await user.click(screen.getByRole('button', { name: '적용' }))

    await screen.findByText('금액은 0보다 큰 정수여야 합니다.')
    // Amount stays empty — the user must fill it in; no write happened.
    expect(screen.getByPlaceholderText('0')).toHaveValue('')
    expect(mockedCreate).not.toHaveBeenCalled()
  })
})

describe('TransactionSheet Memo category suggestion (S09 / PR-10)', () => {
  it('shows recommendation chip after debounced memo typing and sets category on tap', async () => {
    const user = userEvent.setup()
    mockedMemoHistory.mockResolvedValue([{ categoryId: 'c-food', memo: '스타벅스' }])
    renderSheet()

    const memoInput = screen.getByPlaceholderText('메모')
    await user.type(memoInput, '스타벅스')

    // Debounce wait
    await waitFor(() => {
      expect(screen.getByText('추천:')).toBeInTheDocument()
      expect(screen.getAllByRole('button', { name: '식비' })).toHaveLength(2)
    })

    // Nothing selected yet — both the 추천 chip and the category chip are off.
    for (const chip of screen.getAllByRole('button', { name: '식비' })) {
      expect(chip).toHaveAttribute('aria-pressed', 'false')
    }

    // Click recommendation chip (the first '식비' button inside 추천 container)
    const recChip = screen.getByText('추천:').parentElement!
    await user.click(recChip.querySelector('button')!)

    // Tapping the suggestion selects the category (and its fund type) in the form.
    await waitFor(() => {
      for (const chip of screen.getAllByRole('button', { name: '식비' })) {
        expect(chip).toHaveAttribute('aria-pressed', 'true')
      }
    })

    // Verification: LLM/quota call was NEVER made during category suggestion
    expect(mockedInvoke).not.toHaveBeenCalled()
  })

  it('hides the previous memo chips while the replacement query is pending', async () => {
    const user = userEvent.setup()
    // '스타벅스' resolves immediately; every later memo stays in flight until the
    // test releases it, so the assertions run inside the stale window.
    const pending = new Map<string, (rows: { categoryId: string; memo: string }[]) => void>()
    mockedMemoHistory.mockImplementation((_ledgerId: string, memo: string) =>
      memo === '스타벅스'
        ? Promise.resolve([{ categoryId: 'c-food', memo }])
        : new Promise((resolve) => pending.set(memo, resolve)),
    )
    renderSheet()

    const memoInput = screen.getByPlaceholderText('메모')
    await user.type(memoInput, '스타벅스')
    await screen.findByText('추천:')

    // Keep typing: the memo goes nonblank -> nonblank with no empty value in
    // between, which is the case the blank-memo reset does not cover.
    await user.type(memoInput, '월세')
    expect(screen.queryByText('추천:')).not.toBeInTheDocument()

    // ...and they stay hidden while the new request is in flight.
    await waitFor(() => expect(pending.has('스타벅스월세')).toBe(true))
    expect(screen.queryByText('추천:')).not.toBeInTheDocument()

    // Same category as before — so its reappearance is caused by the new result
    // landing, not by the old state having survived.
    await act(async () => {
      pending.get('스타벅스월세')!([{ categoryId: 'c-food', memo: '스타벅스월세' }])
    })
    await screen.findByText('추천:')
  })
})

describe('TransactionSheet pre-save near-duplicate guard (S11 / PR-12)', () => {
  function existingTxn(overrides: Partial<Transaction> = {}): Transaction {
    return {
      id: 'existing-1',
      ledgerId: LEDGER_ID,
      categoryId: 'c-food',
      txnDate: '2026-07-19',
      type: 'expense',
      amount: 12000,
      memo: '점심',
      source: 'manual',
      recurringId: null,
      occurrenceMonth: null,
      createdAt: '',
      updatedAt: '',
      ...overrides,
    }
  }

  it('warns instead of writing when a near-duplicate exists, then saves on a second press', async () => {
    const user = userEvent.setup()
    // One day earlier than the draft — invisible to the old exact key, caught now.
    mockedNearDuplicates.mockResolvedValue([existingTxn({ txnDate: '2026-07-18' })])
    mockedCreate.mockResolvedValue(undefined as never)
    mockedInvoke.mockResolvedValue(
      okResponse({
        amount: 12000,
        type: 'expense',
        categoryName: '식비',
        date: '2026-07-19',
        memo: '점심',
      }),
    )
    renderSheet()

    const field = await screen.findByLabelText('자연어로 입력')
    await user.type(field, '점심 12000원 식비')
    await user.click(screen.getByRole('button', { name: '적용' }))
    await screen.findByDisplayValue('점심')

    await user.click(screen.getByRole('button', { name: '저장' }))

    // First press warns and writes nothing.
    await screen.findByText('비슷한 거래가 이미 1건 있습니다. 중복 입력일 수 있습니다.')
    expect(mockedCreate).not.toHaveBeenCalled()

    // Second press on the same draft goes through the existing create path.
    await user.click(screen.getByRole('button', { name: '그래도 저장' }))
    await waitFor(() => {
      expect(mockedCreate).toHaveBeenCalledWith(LEDGER_ID, {
        categoryId: 'c-food',
        type: 'expense',
        txnDate: '2026-07-19',
        amount: 12000,
        memo: '점심',
      })
    })
  })

  it('revokes the warning when the draft changes, so the guard re-runs', async () => {
    const user = userEvent.setup()
    mockedNearDuplicates.mockResolvedValue([existingTxn()])
    mockedInvoke.mockResolvedValue(
      okResponse({
        amount: 12000,
        type: 'expense',
        categoryName: '식비',
        date: '2026-07-19',
        memo: '점심',
      }),
    )
    renderSheet()

    const field = await screen.findByLabelText('자연어로 입력')
    await user.type(field, '점심 12000원 식비')
    await user.click(screen.getByRole('button', { name: '적용' }))
    await screen.findByDisplayValue('점심')

    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('비슷한 거래가 이미 1건 있습니다. 중복 입력일 수 있습니다.')

    // Editing the amount invalidates the acknowledgement: the banner goes away
    // and the button reverts, so the next press guards again rather than writing.
    await user.type(screen.getByPlaceholderText('0'), '0')
    await waitFor(() => {
      expect(
        screen.queryByText('비슷한 거래가 이미 1건 있습니다. 중복 입력일 수 있습니다.'),
      ).not.toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: '저장' })).toBeInTheDocument()
    expect(mockedCreate).not.toHaveBeenCalled()
  })

  it('saves without warning when the lookup fails (guard fails open)', async () => {
    const user = userEvent.setup()
    mockedNearDuplicates.mockRejectedValue(new Error('network'))
    mockedCreate.mockResolvedValue(undefined as never)
    mockedInvoke.mockResolvedValue(
      okResponse({
        amount: 12000,
        type: 'expense',
        categoryName: '식비',
        date: '2026-07-19',
        memo: '점심',
      }),
    )
    renderSheet()

    const field = await screen.findByLabelText('자연어로 입력')
    await user.type(field, '점심 12000원 식비')
    await user.click(screen.getByRole('button', { name: '적용' }))
    await screen.findByDisplayValue('점심')

    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(mockedCreate).toHaveBeenCalledTimes(1))
  })
})
