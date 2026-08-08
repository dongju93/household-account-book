import { render, screen, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vite-plus/test'

import { RefreshContext } from '../../app/refreshContext'
import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'

vi.mock('../../data/summary', () => ({
  fetchTransactionsInRange: vi.fn(),
  materializeMonths: vi.fn(),
}))
vi.mock('./GeneralSettings', () => ({ GeneralSettings: () => null }))
vi.mock('./InAppAiSettings', () => ({ InAppAiSettings: () => null }))
vi.mock('./AccountSection', () => ({ AccountSection: () => null }))
vi.mock('./CategoryManager', () => ({
  CategoryManager: ({ canManage }: { canManage: boolean }) => (
    <span data-testid="category-access">{String(canManage)}</span>
  ),
}))
vi.mock('./RecurringManager', () => ({
  RecurringManager: ({ canEdit }: { canEdit: boolean }) => (
    <span data-testid="recurring-access">{String(canEdit)}</span>
  ),
}))

import { fetchTransactionsInRange, materializeMonths } from '../../data/summary'
import { SettingsPage } from './SettingsPage'

describe('SettingsPage S10 access boundary', () => {
  it('gives viewers no recommendation history or apply route', async () => {
    const ledger: LedgerValue = {
      status: 'ready',
      ledgerId: 'ledger-1',
      ledgerName: '테스트 가계부',
      role: 'viewer',
      canEdit: false,
      canManage: false,
      reload: () => {},
    }

    render(
      <LedgerContext.Provider value={ledger}>
        <RefreshContext.Provider value={{ version: 0, refresh: () => {} }}>
          <SettingsPage />
        </RefreshContext.Provider>
      </LedgerContext.Provider>,
    )

    expect(screen.getByTestId('category-access')).toHaveTextContent('false')
    expect(screen.getByTestId('recurring-access')).toHaveTextContent('false')
    await waitFor(() => {
      expect(materializeMonths).not.toHaveBeenCalled()
      expect(fetchTransactionsInRange).not.toHaveBeenCalled()
    })
  })
})
