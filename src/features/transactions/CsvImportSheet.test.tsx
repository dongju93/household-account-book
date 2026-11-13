import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vite-plus/test'

import { LedgerContext, type LedgerValue } from '../../auth/ledgerContext'
import { listCategories } from '../../data/categories'
import { checkExistingImportTransactions, importTransactions } from '../../data/transactionImport'
import type { Category } from '../../domain/types'
import { downloadTransactionCsvTemplate } from '../../lib/transactionCsv'
import { CsvImportSheet } from './CsvImportSheet'

vi.mock('../../data/categories', () => ({ listCategories: vi.fn() }))
vi.mock('../../data/transactionImport', () => ({
  checkExistingImportTransactions: vi.fn(),
  importTransactions: vi.fn(),
}))
vi.mock('../../lib/transactionCsv', async (original) => ({
  ...(await original<typeof import('../../lib/transactionCsv')>()),
  downloadTransactionCsvTemplate: vi.fn(),
}))

const categories: Category[] = [
  {
    id: 'food',
    ledgerId: 'ledger',
    name: '식비',
    type: 'expense',
    isActive: true,
    icon: null,
    budgetAmount: null,
    goalAmount: null,
    sortOrder: 0,
    showBudgetPace: false,
    createdAt: '',
    updatedAt: '',
  },
]
const ledger: LedgerValue = {
  status: 'ready',
  ledgerId: 'ledger',
  ledgerName: '가계부',
  role: 'owner',
  canEdit: true,
  canManage: true,
  reload: vi.fn(),
}
const csv = '날짜,구분,카테고리,금액,메모\n2026-11-14,지출,식비,12000,점심'

function setup(value = ledger) {
  const onClose = vi.fn()
  const onSaved = vi.fn()
  const rendered = render(
    <LedgerContext.Provider value={value}>
      <CsvImportSheet
        ledgerId="ledger"
        categories={categories}
        onClose={onClose}
        onSaved={onSaved}
      />
    </LedgerContext.Provider>,
  )
  return { ...rendered, onClose, onSaved }
}
async function upload(text = csv) {
  const user = userEvent.setup()
  await user.upload(
    screen.getByLabelText('CSV 파일 선택'),
    new File([text], '내역.csv', { type: 'text/csv' }),
  )
  return user
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(listCategories).mockResolvedValue(categories)
  vi.mocked(checkExistingImportTransactions).mockResolvedValue([])
  vi.mocked(importTransactions).mockResolvedValue(1)
})

describe('CSV review before write', () => {
  it('downloads the template and does not write until the user reviews and explicitly confirms', async () => {
    const { onSaved } = setup()
    await userEvent.click(screen.getByRole('button', { name: 'CSV 템플릿 다운로드' }))
    expect(downloadTransactionCsvTemplate).toHaveBeenCalledOnce()
    const user = await upload()
    const confirm = await screen.findByRole('button', { name: '확인 후 1건 등록' })
    expect(screen.getByRole('table')).toHaveTextContent('2026-11-14지출식비₩12,000점심')
    expect(confirm).toBeDisabled()
    expect(importTransactions).not.toHaveBeenCalled()
    await user.click(screen.getByRole('checkbox'))
    await user.click(confirm)
    await screen.findByText('1건 등록 완료')
    expect(importTransactions).toHaveBeenCalledOnce()
    expect(onSaved).toHaveBeenCalledOnce()
  })

  it('blocks an entire file on validation errors and shows the offending CSV line', async () => {
    setup()
    await upload(`${csv}\n2026-02-30,수입,식비,-1,`)
    expect(await screen.findByRole('region', { name: 'CSV 검증 오류' })).toHaveTextContent('3행')
    expect(screen.queryByRole('button', { name: /확인 후/ })).not.toBeInTheDocument()
    expect(checkExistingImportTransactions).not.toHaveBeenCalled()
    expect(importTransactions).not.toHaveBeenCalled()
  })

  it('uses refreshed categories and fails closed when a category was deactivated', async () => {
    setup()
    vi.mocked(listCategories).mockResolvedValue([{ ...categories[0], isActive: false }])
    await upload()
    expect(await screen.findByRole('region', { name: 'CSV 검증 오류' })).toHaveTextContent(
      '활성 카테고리',
    )
    expect(importTransactions).not.toHaveBeenCalled()
  })

  it('shows duplicate warnings and requires acknowledgment again when another file is selected', async () => {
    setup()
    vi.mocked(checkExistingImportTransactions).mockResolvedValue([
      { line: 2, field: '기존 거래', message: '이미 있는 거래' },
    ])
    const user = await upload()
    await screen.findByText(/이미 있는 거래/)
    await user.click(screen.getByRole('checkbox'))
    expect(screen.getByRole('button', { name: '확인 후 1건 등록' })).toBeEnabled()
    await upload(csv.replace('12000', '13000'))
    await screen.findByRole('button', { name: '확인 후 1건 등록' })
    expect(screen.getByRole('checkbox')).not.toBeChecked()
    expect(importTransactions).not.toHaveBeenCalled()
  })

  it('blocks closing/double submits while saving and retries with the same request id', async () => {
    const { onClose } = setup()
    let rejectSave!: (error: Error) => void
    vi.mocked(importTransactions).mockImplementationOnce(
      () =>
        new Promise((_, reject) => {
          rejectSave = reject
        }),
    )
    const user = await upload()
    const confirm = await screen.findByRole('button', { name: '확인 후 1건 등록' })
    await user.click(screen.getByRole('checkbox'))
    await user.dblClick(confirm)
    expect(importTransactions).toHaveBeenCalledOnce()
    expect(screen.getByRole('button', { name: '닫기' })).toBeDisabled()
    const dialog = screen.getByRole('dialog')
    const cancel = new Event('cancel', { cancelable: true })
    fireEvent(dialog, cancel)
    expect(cancel.defaultPrevented).toBe(true)
    fireEvent.click(dialog)
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('progressbar')).not.toHaveAttribute('value')
    await act(async () => rejectSave(new Error('연결 끊김')))
    await screen.findByText(/같은 요청은 중복 저장되지 않습니다/)
    await user.click(screen.getByRole('button', { name: '확인 후 1건 등록' }))
    await screen.findByText('1건 등록 완료')
    expect(vi.mocked(importTransactions).mock.calls[0]).toEqual(
      vi.mocked(importTransactions).mock.calls[1],
    )
  })

  it('ignores an older validation result after another file is chosen', async () => {
    setup()
    let resolveOld!: (value: Category[]) => void
    vi.mocked(listCategories).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          resolveOld = resolve
        }),
    )
    await upload()
    await waitFor(() => expect(listCategories).toHaveBeenCalledOnce())
    await upload(csv.replace('점심', '저녁'))
    await screen.findByText('저녁')
    await act(async () => resolveOld(categories))
    expect(screen.getByRole('table')).toHaveTextContent('저녁')
    expect(screen.getByRole('table')).not.toHaveTextContent('점심')
  })

  it('does not allow viewers to submit even if the sheet is mounted', async () => {
    setup({ ...ledger, role: 'viewer', canEdit: false, canManage: false })
    const user = await upload()
    const confirm = await screen.findByRole('button', { name: '확인 후 1건 등록' })
    await user.click(screen.getByRole('checkbox'))
    expect(confirm).toBeDisabled()
    expect(importTransactions).not.toHaveBeenCalled()
  })

  it('shows every row through review pagination', async () => {
    setup()
    const rows = Array.from(
      { length: 26 },
      (_, index) => `2026-11-14,지출,식비,${index + 1},메모${index + 1}`,
    )
    const user = await upload(`날짜,구분,카테고리,금액,메모\n${rows.join('\n')}`)
    await screen.findByRole('button', { name: '확인 후 26건 등록' })
    expect(screen.getByRole('table')).not.toHaveTextContent('메모26')
    await user.click(screen.getByRole('button', { name: '다음' }))
    expect(screen.getByRole('table')).toHaveTextContent('메모26')
    expect(importTransactions).not.toHaveBeenCalled()
  })
})
