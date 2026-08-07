import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it } from 'vite-plus/test'

import { findFuzzyDuplicateGroups } from '../../domain/fuzzyDuplicates'
import type { Transaction } from '../../domain/types'
import { DuplicateSuspectBanner } from './DuplicateSuspectBanner'

const NAMES = new Map([['c-food', '식비']])

let seq = 0
function txn(overrides: Partial<Transaction> = {}): Transaction {
  seq += 1
  return {
    id: `t${seq}`,
    ledgerId: 'ledger-1',
    categoryId: 'c-food',
    txnDate: '2026-07-19',
    type: 'expense',
    amount: 12_000,
    memo: '점심',
    source: 'manual',
    recurringId: null,
    occurrenceMonth: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  }
}

describe('DuplicateSuspectBanner (S11 / PR-12)', () => {
  it('renders nothing when no group was detected', () => {
    const { container } = render(
      <DuplicateSuspectBanner
        groups={findFuzzyDuplicateGroups([txn()])}
        categoryNameById={NAMES}
      />,
    )
    expect(container).toBeEmptyDOMElement()
  })

  it('labels a suspected group and offers no mutating action', async () => {
    const user = userEvent.setup()
    const groups = findFuzzyDuplicateGroups([
      txn({ txnDate: '2026-07-19' }),
      txn({ txnDate: '2026-07-20' }),
    ])
    render(<DuplicateSuspectBanner groups={groups} categoryNameById={NAMES} />)

    expect(
      screen.getByText('불러온 내역에서 중복이 의심되는 거래 1건이 있습니다.'),
    ).toBeInTheDocument()
    expect(
      screen.getByText(
        '자동으로 삭제하거나 합치지 않습니다. 직접 확인한 뒤 필요한 거래만 수정하세요.',
      ),
    ).toBeInTheDocument()

    // The only control is the expand toggle — no 삭제 / 합치기 affordance exists.
    const buttons = screen.getAllByRole('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveAccessibleName('보기')

    await user.click(buttons[0])
    expect(screen.getByText(/식비/)).toBeInTheDocument()
    expect(screen.getByText(/2건/)).toBeInTheDocument()
  })
})
