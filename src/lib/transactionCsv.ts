import { CSV_MAX_BYTES, CSV_TEMPLATE } from '../domain/importTransactions'

export function downloadTransactionCsvTemplate(): void {
  const url = URL.createObjectURL(new Blob([CSV_TEMPLATE], { type: 'text/csv;charset=utf-8' }))
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = '거래_일괄등록_템플릿.csv'
  document.body.append(anchor)
  anchor.click()
  anchor.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/** File picker accept is only a hint; enforce limits before allocating a reader. */
export function readTransactionCsv(
  file: File,
  signal: AbortSignal,
  onProgress: (pct: number) => void,
): Promise<string> {
  if (!/\.csv$/i.test(file.name)) return Promise.reject(new Error('.csv 파일을 선택하세요.'))
  if (!file.size || file.size > CSV_MAX_BYTES)
    return Promise.reject(new Error('비어 있지 않은 1MiB 이하 CSV 파일을 선택하세요.'))
  signal.throwIfAborted()
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    const abort = () => reader.abort()
    const cleanup = () => signal.removeEventListener('abort', abort)
    signal.addEventListener('abort', abort, { once: true })
    reader.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    reader.onerror = () => {
      cleanup()
      reject(new Error('파일을 읽지 못했습니다. 다시 선택하세요.'))
    }
    reader.onabort = () => {
      cleanup()
      reject(new DOMException('파일 읽기를 취소했습니다.', 'AbortError'))
    }
    reader.onload = () => {
      cleanup()
      try {
        const text = new TextDecoder('utf-8', { fatal: true }).decode(reader.result as ArrayBuffer)
        onProgress(100)
        resolve(text)
      } catch {
        reject(
          new Error(
            'UTF-8 CSV 파일이 아닙니다. Excel에서 “CSV UTF-8(쉼표로 분리)” 형식으로 저장하세요.',
          ),
        )
      }
    }
    reader.readAsArrayBuffer(file)
  })
}
