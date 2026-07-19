import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

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
}))
vi.mock('../../ai/client', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../ai/client')>()
  return { ...actual, invokeAiFeature: vi.fn() }
})

import { invokeAiFeature } from '../../ai/client'
import { getAiUserSettings } from '../../data/aiSettings'
import { createTransaction } from '../../data/transactions'
import { TransactionSheet } from './TransactionSheet'

const mockedInvoke = vi.mocked(invokeAiFeature)
const mockedSettings = vi.mocked(getAiUserSettings)
const mockedCreate = vi.mocked(createTransaction)

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
    model: 'grok-4.3',
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
        <TransactionSheet
          open
          onClose={() => {}}
          ledgerId={LEDGER_ID}
          transaction={null}
          categories={CATEGORIES}
          onSaved={() => {}}
        />
      </LedgerContext.Provider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedSettings.mockResolvedValue(aiSettings(true))
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
