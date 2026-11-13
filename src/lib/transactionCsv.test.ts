import { describe, expect, it, vi } from 'vite-plus/test'

import { CSV_MAX_BYTES } from '../domain/importTransactions'
import { downloadTransactionCsvTemplate, readTransactionCsv } from './transactionCsv'

describe('CSV file boundary', () => {
  it('reads UTF-8 with progress', async () => {
    const progress = vi.fn()
    expect(
      await readTransactionCsv(
        new File(['날짜,구분'], '내역.CSV'),
        new AbortController().signal,
        progress,
      ),
    ).toBe('날짜,구분')
    expect(progress).toHaveBeenLastCalledWith(100)
  })
  it('rejects legacy encoding rather than replacing corrupt Korean text', async () => {
    await expect(
      readTransactionCsv(
        new File([new Uint8Array([0xff, 0xfe, 0xb0])], 'legacy.csv'),
        new AbortController().signal,
        vi.fn(),
      ),
    ).rejects.toThrow('UTF-8')
  })
  it('enforces size, extension, nonempty files and cancellation', async () => {
    const signal = new AbortController().signal
    await expect(readTransactionCsv(new File(['a'], 'a.xlsx'), signal, vi.fn())).rejects.toThrow(
      '.csv',
    )
    await expect(readTransactionCsv(new File([], 'a.csv'), signal, vi.fn())).rejects.toThrow('비어')
    await expect(
      readTransactionCsv(new File(['a'.repeat(CSV_MAX_BYTES + 1)], 'a.csv'), signal, vi.fn()),
    ).rejects.toThrow('1MiB')
    const abort = new AbortController()
    const reading = readTransactionCsv(new File(['abc'], 'a.csv'), abort.signal, vi.fn())
    abort.abort()
    await expect(reading).rejects.toMatchObject({ name: 'AbortError' })
  })
  it('downloads a CSV template and releases the object URL', () => {
    vi.useFakeTimers()
    const create = vi.fn().mockReturnValue('blob:template')
    const revoke = vi.fn()
    vi.stubGlobal(
      'URL',
      class extends URL {
        static createObjectURL = create
        static revokeObjectURL = revoke
      },
    )
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    try {
      downloadTransactionCsvTemplate()
      expect(create).toHaveBeenCalledWith(expect.any(Blob))
      expect(click.mock.instances[0]).toHaveAttribute('download', '거래_일괄등록_템플릿.csv')
      vi.runAllTimers()
      expect(revoke).toHaveBeenCalledWith('blob:template')
    } finally {
      click.mockRestore()
      vi.unstubAllGlobals()
      vi.useRealTimers()
    }
  })
})
