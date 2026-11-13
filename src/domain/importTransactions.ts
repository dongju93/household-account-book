import { FUND_TYPES, fundTypeLabel, type FundType } from './fundType'
import type { Category, Transaction } from './types'

export const CSV_HEADERS = ['날짜', '구분', '카테고리', '금액', '메모'] as const
export const CSV_MAX_BYTES = 1024 * 1024
export const CSV_MAX_ROWS = 500
export const CSV_TEMPLATE = `\uFEFF${CSV_HEADERS.join(',')}\r\n`

export interface CsvIssue {
  line: number
  field: string
  message: string
}

export interface CsvTransaction {
  readonly line: number
  readonly txnDate: string
  readonly type: FundType
  readonly categoryId: string
  readonly categoryName: string
  readonly amount: number
  readonly memo: string | null
}

const validatedImport = Symbol('ValidatedCsvImport')
/** Constructed only by the CSV boundary parser; DB independently enforces its contract. */
export interface ValidatedCsvImport {
  readonly [validatedImport]: true
  readonly rows: readonly CsvTransaction[]
  readonly warnings: readonly CsvIssue[]
}

export type CsvImportResult =
  | { ok: true; value: ValidatedCsvImport }
  | { ok: false; errors: CsvIssue[] }

type ImportCategory = Pick<Category, 'id' | 'name' | 'type' | 'isActive'>
// Reject control bytes at the file boundary; tabs and line endings are valid CSV content.
// oxlint-disable-next-line no-control-regex
const forbiddenControls = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u

/** Strict comma-separated CSV: escaped quotes, quoted newlines, CRLF/LF/CR, BOM. */
function parseRecords(text: string): { fields: string[]; line: number }[] {
  const records: { fields: string[]; line: number }[] = []
  let fields: string[] = []
  let field = ''
  let state: 'start' | 'plain' | 'quoted' | 'closed' = 'start'
  let line = 1
  let recordLine = 1
  const finishRecord = () => {
    fields.push(field)
    // Ignore physically empty lines, but never silently discard a row of empty cells.
    if (fields.length !== 1 || fields[0].trim() !== '') {
      records.push({ fields, line: recordLine })
      if (records.length > CSV_MAX_ROWS + 1)
        throw new Error(`최대 ${CSV_MAX_ROWS}건까지 등록할 수 있습니다.`)
    }
    fields = []
    field = ''
    state = 'start'
  }
  for (let i = text.charCodeAt(0) === 0xfeff ? 1 : 0; i < text.length; i++) {
    const c = text[i]
    const newline = c === '\r' || c === '\n'
    if (state === 'quoted') {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i++
        } else state = 'closed'
      } else if (newline) {
        field += '\n'
        if (c === '\r' && text[i + 1] === '\n') i++
        line++
      } else field += c
      continue
    }
    if (c === ',') {
      fields.push(field)
      if (fields.length >= CSV_HEADERS.length)
        throw new Error(
          `${recordLine}행: 열이 너무 많습니다. 쉼표가 포함된 값은 큰따옴표로 감싸세요.`,
        )
      field = ''
      state = 'start'
    } else if (newline) {
      finishRecord()
      if (c === '\r' && text[i + 1] === '\n') i++
      line++
      recordLine = line
    } else if (c === '"' && state === 'start') state = 'quoted'
    else {
      if (c === '"' || state === 'closed')
        throw new Error(`${line}행: 큰따옴표 형식이 올바르지 않습니다.`)
      field += c
      state = 'plain'
    }
  }
  if (state === 'quoted') throw new Error(`${recordLine}행: 닫히지 않은 큰따옴표가 있습니다.`)
  finishRecord()
  return records
}

function isCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  if (year < 1 || month < 1 || month > 12 || day < 1) return false
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  return day <= [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]
}

function transactionKey(
  row: Pick<CsvTransaction, 'txnDate' | 'type' | 'categoryId' | 'amount' | 'memo'>,
): string {
  return JSON.stringify([
    row.txnDate,
    row.type,
    row.categoryId,
    row.amount,
    row.memo?.trim() || null,
  ])
}

export function parseTransactionCsv(
  text: string,
  categories: readonly ImportCategory[],
): CsvImportResult {
  const fail = (message: string): CsvImportResult => ({
    ok: false,
    errors: [{ line: 0, field: '파일', message }],
  })
  if (new TextEncoder().encode(text).length > CSV_MAX_BYTES)
    return fail('파일은 1MiB 이하여야 합니다.')
  if (forbiddenControls.test(text)) return fail('허용되지 않는 제어 문자가 있습니다.')
  let records: ReturnType<typeof parseRecords>
  try {
    records = parseRecords(text)
  } catch (error) {
    return fail((error as Error).message)
  }
  const [header, ...data] = records
  if (
    !header ||
    header.fields.length !== CSV_HEADERS.length ||
    header.fields.some((field, i) => field.trim() !== CSV_HEADERS[i])
  ) {
    return fail(`첫 행은 ${CSV_HEADERS.join(',')} 순서여야 합니다. 템플릿을 사용하세요.`)
  }
  if (!data.length) return fail('등록할 거래가 없습니다. 헤더 아래에 거래를 입력하세요.')

  const errors: CsvIssue[] = []
  const rows: CsvTransaction[] = []
  const warnings: CsvIssue[] = []
  const seen = new Map<string, number>()
  const byName = new Map<string, ImportCategory[]>()
  for (const category of categories) {
    if (category.isActive) {
      const name = category.name.trim()
      byName.set(name, [...(byName.get(name) ?? []), category])
    }
  }
  for (const { fields, line } of data) {
    const errorCount = errors.length
    const issue = (field: string, message: string) => errors.push({ line, field, message })
    if (fields.length !== CSV_HEADERS.length) {
      issue('열', '5개 열이 필요합니다. 메모가 없어도 마지막 쉼표를 유지하세요.')
      continue
    }
    const [txnDate, label, categoryName, rawAmount, rawMemo] = fields.map((value) => value.trim())
    const type = FUND_TYPES.find((value) => fundTypeLabel(value) === label)
    if (!isCalendarDate(txnDate))
      issue('날짜', '실제 존재하는 날짜를 YYYY-MM-DD 형식으로 입력하세요. (0001~9999년)')
    if (!type) issue('구분', '수입, 지출, 저축, 투자 중 하나를 입력하세요.')
    const matches = (byName.get(categoryName) ?? []).filter((category) => category.type === type)
    const category = matches.length === 1 ? matches[0] : null
    if (!category)
      issue(
        '카테고리',
        matches.length > 1
          ? '이름이 모호합니다. 설정에서 카테고리 이름을 구분하세요.'
          : '거래 구분에 맞는 활성 카테고리 이름을 정확히 입력하세요.',
      )
    // Never round, truncate decimals, strip arbitrary punctuation, or accept exponents.
    const amount = /^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)$/.test(rawAmount)
      ? Number(rawAmount.replaceAll(',', ''))
      : NaN
    if (!Number.isSafeInteger(amount) || amount <= 0)
      issue(
        '금액',
        '1~9,007,199,254,740,991원의 정수만 허용합니다. 소수·음수·통화 기호는 사용할 수 없습니다.',
      )
    // PostgreSQL length(text) counts code points, rather than UTF-16 units or graphemes.
    if (Array.from(rawMemo).length > 200) issue('메모', '메모는 200자 이하여야 합니다.')
    if (errors.length !== errorCount || !type || !category) continue
    const row: CsvTransaction = {
      line,
      txnDate,
      type,
      categoryId: category.id,
      categoryName: category.name,
      amount,
      memo: rawMemo || null,
    }
    const key = transactionKey(row)
    const earlier = seen.get(key)
    if (earlier !== undefined)
      warnings.push({
        line,
        field: '중복',
        message: `${earlier}행과 동일한 거래입니다. 두 행 모두 저장됩니다.`,
      })
    else seen.set(key, line)
    rows.push(row)
  }
  if (errors.length) return { ok: false, errors }
  return {
    ok: true,
    value: Object.freeze({
      [validatedImport]: true as const,
      rows: Object.freeze(rows.map((row) => Object.freeze(row))),
      warnings: Object.freeze(warnings.map((warning) => Object.freeze(warning))),
    }),
  }
}

/** Exact matches are warnings: identical payments can be legitimate. */
export function existingImportWarnings(
  rows: readonly CsvTransaction[],
  existing: readonly Transaction[],
): CsvIssue[] {
  const keys = new Set(existing.map(transactionKey))
  return rows
    .filter((row) => keys.has(transactionKey(row)))
    .map((row) => ({
      line: row.line,
      field: '기존 거래',
      message: '날짜·구분·카테고리·금액·메모가 같은 거래가 이미 있습니다. 추가 저장됩니다.',
    }))
}
