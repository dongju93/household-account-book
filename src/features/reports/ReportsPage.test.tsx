import { render, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { RefreshContext } from '../../app/refreshContext'
import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import { addMonths, currentYearMonth } from '../../lib/month'

vi.mock('../../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../../data/summary', () => ({
  materializeMonths: vi.fn(),
  fetchTransactionsInRange: vi.fn(),
}))
// Recharts needs layout dimensions jsdom doesn't provide; the chart isn't under
// test, only the materialization window, so stub it out.
vi.mock('./ReportsCharts', () => ({ ReportsCharts: () => null }))
// Isolate from the WebMCP runtime — tool registration is covered by its own test.
vi.mock('../../webmcp/useStatsQnaTools', () => ({ useStatsQnaTools: vi.fn() }))

vi.mock('../../lib/supabase', () => ({ supabase: {} }))
vi.mock('../../data/aiSettings', () => ({
  getAiUserSettings: vi.fn().mockResolvedValue({
    userId: 'user-1',
    inAppAiEnabled: false,
    shareMemoWithAi: true,
    updatedAt: null,
  }),
}))

import { AiSettingsProvider } from '../../ai/AiSettingsProvider'
import { AuthContext, type AuthValue } from '../../auth/authContext'
import { listCategories } from '../../data/categories'
import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import { ReportsPage } from './ReportsPage'

const mockedListCategories = vi.mocked(listCategories)
const mockedFetchTxns = vi.mocked(fetchTransactionsInRange)
const mockedMaterializeMonths = vi.mocked(materializeMonths)

function renderPage() {
  const authValue: AuthValue = {
    status: 'authed',
    user: { id: 'user-1' } as AuthValue['user'],
    session: null,
    signIn: async () => ({}),
    signUp: async () => ({}),
    signOut: async () => {},
  }
  const ledgerValue: LedgerValue = {
    status: 'ready',
    ledgerId: 'ledger-1',
    ledgerName: null,
    role: 'owner',
    canEdit: true,
    canManage: true,
    reload: () => {},
  }
  return render(
    <AuthContext.Provider value={authValue}>
      <AiSettingsProvider>
        <LedgerContext.Provider value={ledgerValue}>
          <RefreshContext.Provider value={{ version: 0, refresh: () => {} }}>
            <ReportsPage />
          </RefreshContext.Provider>
        </LedgerContext.Provider>
      </AiSettingsProvider>
    </AuthContext.Provider>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  mockedListCategories.mockResolvedValue([])
  mockedFetchTxns.mockResolvedValue([])
})

describe('ReportsPage', () => {
  it('materializes the full 12-month window even though the default chip is 6 months', async () => {
    renderPage()

    await waitFor(() => expect(mockedMaterializeMonths).toHaveBeenCalled())

    const [ledgerId, months] = mockedMaterializeMonths.mock.calls[0]
    expect(ledgerId).toBe('ledger-1')
    expect(months).toHaveLength(12)

    // Window is the 12 months ending at (and including) the current month.
    const anchor = currentYearMonth()
    expect(months[11]).toEqual(anchor)
    expect(months[0]).toEqual(addMonths(anchor, -11))
  })
})
