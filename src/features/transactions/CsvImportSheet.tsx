import { useEffect, useId, useRef, useState } from 'react'

import { useLedger } from '../../auth/useLedger'
import { listCategories } from '../../data/categories'
import { describeError } from '../../data/errors'
import { checkExistingImportTransactions, importTransactions } from '../../data/transactionImport'
import { fundTypeLabel, FUND_TYPES } from '../../domain/fundType'
import {
  CSV_MAX_ROWS,
  parseTransactionCsv,
  type CsvIssue,
  type ValidatedCsvImport,
} from '../../domain/importTransactions'
import type { Category } from '../../domain/types'
import { won } from '../../lib/format'
import { downloadTransactionCsvTemplate, readTransactionCsv } from '../../lib/transactionCsv'
import { BottomSheet, Button, ErrorBanner } from '../../ui'

type Review = {
  filename: string
  requestId: string
  value: ValidatedCsvImport
  warnings: readonly CsvIssue[]
}
type ImportState =
  | { step: 'select' }
  | { step: 'validating'; filename: string; progress: number; label: string }
  | { step: 'invalid'; filename: string; errors: readonly CsvIssue[] }
  | { step: 'review'; review: Review; error?: string }
  | { step: 'saving'; review: Review }
  | { step: 'done'; count: number }

export function CsvImportSheet({
  ledgerId,
  categories,
  onClose,
  onSaved,
}: {
  ledgerId: string
  categories: readonly Category[]
  onClose: () => void
  onSaved: () => void
}) {
  const { ledgerId: currentLedgerId, canEdit } = useLedger()
  const [state, setState] = useState<ImportState>({ step: 'select' })
  const [acknowledged, setAcknowledged] = useState(false)
  const [page, setPage] = useState(0)
  const workRef = useRef<AbortController | null>(null)
  const saveLock = useRef(false)
  const fileInputId = useId()
  const helpId = useId()
  const progressId = useId()
  const saving = state.step === 'saving'
  const review = state.step === 'review' || state.step === 'saving' ? state.review : null

  useEffect(() => () => workRef.current?.abort(), [])
  useEffect(() => {
    if (!saving) return
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', beforeUnload)
    return () => window.removeEventListener('beforeunload', beforeUnload)
  }, [saving])

  function close() {
    if (saveLock.current) return
    workRef.current?.abort()
    onClose()
  }

  async function selectFile(file: File) {
    if (saveLock.current) return
    workRef.current?.abort()
    const controller = new AbortController()
    workRef.current = controller
    const { signal } = controller
    setAcknowledged(false)
    setPage(0)
    const update = (progress: number, label: string) => {
      if (!signal.aborted) setState({ step: 'validating', filename: file.name, progress, label })
    }
    update(0, '파일 읽는 중')
    try {
      const text = await readTransactionCsv(file, signal, (pct) =>
        update(Math.round(pct / 4), '파일 읽는 중'),
      )
      signal.throwIfAborted()
      update(30, '행별 데이터 검증 중')
      // Refresh names/active status rather than trusting the screen's older category snapshot.
      const latestCategories = await listCategories(ledgerId, { signal })
      signal.throwIfAborted()
      const result = parseTransactionCsv(text, latestCategories)
      if (!result.ok) {
        setState({ step: 'invalid', filename: file.name, errors: result.errors })
        return
      }
      update(40, '기존 거래와 중복 확인 중')
      const existingWarnings = await checkExistingImportTransactions(
        ledgerId,
        result.value.rows,
        signal,
        (pct) => update(40 + Math.round(pct * 0.6), '기존 거래와 중복 확인 중'),
      )
      signal.throwIfAborted()
      setState({
        step: 'review',
        review: {
          filename: file.name,
          requestId: crypto.randomUUID(),
          value: result.value,
          warnings: [...result.value.warnings, ...existingWarnings],
        },
      })
    } catch (error) {
      if (!signal.aborted)
        setState({
          step: 'invalid',
          filename: file.name,
          errors: [{ line: 0, field: '파일', message: describeError(error).message }],
        })
    }
  }

  async function confirm() {
    if (
      state.step !== 'review' ||
      !acknowledged ||
      saveLock.current ||
      !canEdit ||
      currentLedgerId !== ledgerId
    )
      return
    const selected = state.review
    saveLock.current = true
    setState({ step: 'saving', review: selected })
    try {
      const count = await importTransactions(ledgerId, selected.requestId, selected.value)
      setState({ step: 'done', count })
      onSaved()
    } catch (error) {
      setState({
        step: 'review',
        review: selected,
        error: `${describeError(error).message} 저장 결과가 불확실하면 이 화면에서 다시 시도하세요. 같은 요청은 중복 저장되지 않습니다.`,
      })
    } finally {
      saveLock.current = false
    }
  }

  const showPicker = state.step !== 'saving' && state.step !== 'done'
  const pageSize = 25
  const pageCount = review ? Math.ceil(review.value.rows.length / pageSize) : 0

  return (
    <BottomSheet open onClose={close} title="CSV 일괄 등록" dismissible={!saving}>
      <div className="flex flex-col gap-4">
        <ol
          aria-label="일괄 등록 단계"
          className="text-caption flex flex-wrap gap-x-4 gap-y-1 text-ink2"
        >
          {['파일 선택·검증', '내역 확인', '저장'].map((label, index) => {
            const current =
              state.step === 'review' ? 1 : state.step === 'saving' || state.step === 'done' ? 2 : 0
            return (
              <li
                key={label}
                aria-current={current === index ? 'step' : undefined}
                className={current === index ? 'font-bold text-ink' : ''}
              >
                {index + 1}. {label}
              </li>
            )
          })}
        </ol>

        {showPicker && (
          <>
            <p id={helpId} className="text-caption text-ink2">
              UTF-8 CSV · 최대 1MiB / {CSV_MAX_ROWS}건. 오류가 있으면 전체 등록을 막습니다. 검토 후
              확인할 때 저장합니다.
            </p>
            <Button variant="ghost" onClick={downloadTransactionCsvTemplate}>
              CSV 템플릿 다운로드
            </Button>
            <details className="text-caption rounded-surface border border-line p-3 text-ink2">
              <summary className="min-h-8 cursor-pointer font-semibold text-ink">
                작성 방법·사용 가능한 카테고리
              </summary>
              <ul className="mt-2 list-disc space-y-1 pl-4">
                <li>열 순서: 날짜, 구분, 카테고리, 금액, 메모. 헤더는 유지하세요.</li>
                <li>날짜: YYYY-MM-DD (예: 2026-11-14). 구분: 수입 / 지출 / 저축 / 투자.</li>
                <li>
                  금액: 원 단위 양의 정수. 쉼표가 있는 금액은 큰따옴표로 감싸세요. 예:
                  &quot;10,000&quot;
                </li>
                <li>
                  메모: 선택 사항, 최대 200자. 쉼표·줄바꿈이 있으면 큰따옴표로 감싸고, 큰따옴표는 두
                  번 적으세요.
                </li>
                <li>
                  빈 템플릿에 직접 거래를 입력하세요. 현재 화면의 월·필터와 관계없이 CSV에 적힌
                  날짜로 등록합니다.
                </li>
              </ul>
              {FUND_TYPES.map((type) => (
                <p key={type} className="mt-2 break-words">
                  <strong>{fundTypeLabel(type)}</strong>:{' '}
                  {categories
                    .filter((category) => category.isActive && category.type === type)
                    .map((category) => category.name)
                    .join(', ') || '활성 카테고리 없음'}
                </p>
              ))}
            </details>
            <label htmlFor={fileInputId} className="text-caption font-semibold text-ink">
              CSV 파일 선택
            </label>
            <input
              id={fileInputId}
              type="file"
              accept=".csv,text/csv"
              aria-describedby={helpId}
              className="text-caption min-h-11 w-full min-w-0 rounded-control border border-line p-2 text-ink file:mr-2 file:rounded-control file:border-0 file:bg-fill1 file:px-3 file:py-2 file:text-ink"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0]
                event.currentTarget.value = ''
                if (file) void selectFile(file)
              }}
            />
          </>
        )}

        {state.step === 'validating' && (
          <div className="flex flex-col gap-2">
            <p className="text-caption break-all text-ink2">{state.filename}</p>
            <label htmlFor={progressId} className="text-caption text-ink">
              {state.label} · {state.progress}%
            </label>
            <progress
              id={progressId}
              max={100}
              value={state.progress}
              className="w-full accent-ink"
            />
            <Button
              variant="ghost"
              onClick={() => {
                workRef.current?.abort()
                setState({ step: 'select' })
              }}
            >
              검증 취소
            </Button>
          </div>
        )}

        {state.step === 'invalid' && (
          <section aria-label="CSV 검증 오류" className="flex flex-col gap-2">
            <ErrorBanner
              message={`검증 실패 · 오류 ${state.errors.length}개. 파일을 수정한 뒤 다시 선택하세요. 저장된 거래는 없습니다.`}
            />
            <p className="text-caption break-all text-ink2">{state.filename}</p>
            <ul className="text-caption max-h-64 space-y-2 overflow-y-auto rounded-surface border border-line p-3">
              {state.errors.map((error, index) => (
                <li key={index} className="break-words text-status-danger">
                  {error.line ? `${error.line}행 · ` : ''}
                  {error.field}: {error.message}
                </li>
              ))}
            </ul>
          </section>
        )}

        {review && (
          <>
            <div role="status" className="text-caption text-ink2">
              <p className="break-all">{review.filename}</p>
              <p className="font-semibold text-ink">
                검증 완료 · {review.value.rows.length}건. 아래 내역을 확인하세요.
              </p>
            </div>
            {!saving && (
              <progress
                max={100}
                value={100}
                aria-label="CSV 검증 완료"
                className="w-full accent-ink"
              />
            )}
            <dl className="grid grid-cols-2 gap-2 rounded-surface bg-fill1 p-3 text-caption">
              {FUND_TYPES.map((type) => (
                <div key={type}>
                  <dt className="text-ink2">{fundTypeLabel(type)}</dt>
                  <dd className="tnum break-all font-semibold text-ink">
                    ₩
                    {review.value.rows
                      .filter((row) => row.type === type)
                      .reduce((sum, row) => sum + BigInt(row.amount), 0n)
                      .toLocaleString('ko-KR')}
                  </dd>
                </div>
              ))}
            </dl>
            {review.warnings.length > 0 && (
              <details
                className="rounded-surface border border-status-warning/35 bg-status-warning/8 p-3 text-caption"
                open
              >
                <summary className="font-semibold text-status-warning">
                  중복 가능성 {review.warnings.length}개 · 확인이 필요합니다
                </summary>
                <ul className="mt-2 max-h-40 space-y-1 overflow-y-auto text-ink2">
                  {review.warnings.map((warning, index) => (
                    <li key={index}>
                      {warning.line}행: {warning.message}
                    </li>
                  ))}
                </ul>
              </details>
            )}
            <div
              role="region"
              aria-label="등록할 거래 내역"
              tabIndex={0}
              className="overflow-x-auto rounded-surface border border-line"
            >
              <table className="w-full text-left text-caption">
                <caption className="p-2 text-left font-semibold text-ink">
                  등록 예정 내역 · {page + 1}/{pageCount}페이지 (전체 {review.value.rows.length}건)
                </caption>
                <thead className="bg-fill1 text-ink2">
                  <tr>
                    {['CSV 행', '날짜', '구분', '카테고리', '금액', '메모'].map((label) => (
                      <th key={label} scope="col" className="whitespace-nowrap p-2 font-semibold">
                        {label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {review.value.rows.slice(page * pageSize, (page + 1) * pageSize).map((row) => (
                    <tr key={row.line} className="border-t border-line text-ink">
                      <td className="tnum p-2">{row.line}</td>
                      <td className="tnum whitespace-nowrap p-2">{row.txnDate}</td>
                      <td className="whitespace-nowrap p-2">{fundTypeLabel(row.type)}</td>
                      <td className="min-w-24 break-words p-2">{row.categoryName}</td>
                      <td className="tnum whitespace-nowrap p-2 text-right">{won(row.amount)}</td>
                      <td className="min-w-36 whitespace-pre-wrap break-words p-2">
                        {row.memo ?? '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <nav aria-label="검토 내역 페이지" className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  disabled={page === 0 || saving}
                  onClick={() => setPage((value) => value - 1)}
                >
                  이전
                </Button>
                <span className="tnum shrink-0 text-caption">
                  {page + 1} / {pageCount}
                </span>
                <Button
                  variant="ghost"
                  disabled={page === pageCount - 1 || saving}
                  onClick={() => setPage((value) => value + 1)}
                >
                  다음
                </Button>
              </nav>
            )}
            <label className="text-caption flex items-start gap-2 py-2 text-ink">
              <input
                type="checkbox"
                checked={acknowledged}
                disabled={saving}
                onChange={(event) => setAcknowledged(event.target.checked)}
                className="mt-0.5 size-5 shrink-0 accent-ink"
              />
              <span>
                전체 {review.value.rows.length}건의 날짜·구분·카테고리·금액·메모
                {review.warnings.length > 0 ? '와 중복 경고' : ''}를 확인했으며, 이대로 등록합니다.
              </span>
            </label>
            {state.step === 'review' && state.error && <ErrorBanner message={state.error} />}
            {saving ? (
              <div className="flex flex-col gap-2">
                <p role="status" className="text-caption text-ink">
                  {review.value.rows.length}건 일괄 저장 중… 완료될 때까지 기다려 주세요.
                </p>
                <progress aria-label="거래 일괄 저장 중" className="w-full accent-ink" />
              </div>
            ) : (
              <Button
                disabled={!acknowledged || !canEdit || currentLedgerId !== ledgerId}
                onClick={() => void confirm()}
              >
                확인 후 {review.value.rows.length}건 등록
              </Button>
            )}
          </>
        )}

        {state.step === 'done' && (
          <>
            <p role="status" className="text-body font-semibold text-ink">
              {state.count}건 등록 완료
            </p>
            <progress
              max={100}
              value={100}
              aria-label="거래 등록 완료"
              className="w-full accent-ink"
            />
            <p className="text-caption text-ink2">
              CSV에 입력한 날짜의 내역에 반영했습니다. 다른 월의 거래는 해당 월로 이동해 확인하세요.
            </p>
            <Button onClick={close}>완료</Button>
          </>
        )}
      </div>
    </BottomSheet>
  )
}
