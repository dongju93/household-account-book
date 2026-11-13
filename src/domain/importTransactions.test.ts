import { describe, expect, it } from 'vite-plus/test'

import {
  CSV_HEADERS,
  CSV_MAX_BYTES,
  CSV_MAX_ROWS,
  CSV_TEMPLATE,
  existingImportWarnings,
  parseTransactionCsv,
} from './importTransactions'
import type { Transaction } from './types'

const categories = [
  { id: 'food', name: '식비', type: 'expense' as const, isActive: true },
  { id: 'pay', name: '급여', type: 'income' as const, isActive: true },
  { id: 'save', name: '적금', type: 'saving' as const, isActive: true },
  { id: 'stock', name: '주식', type: 'investment' as const, isActive: true },
  { id: 'old', name: '이전', type: 'expense' as const, isActive: false },
]
const header = CSV_HEADERS.join(',')
const parse = (row: string) => parseTransactionCsv(`${header}\n${row}`, categories)

describe('transaction CSV boundary', () => {
  it('produces a header-only UTF-8 BOM template that cannot accidentally insert an example', () => {
    expect(CSV_TEMPLATE).toBe(`\uFEFF${header}\r\n`)
    expect(parseTransactionCsv(CSV_TEMPLATE, categories).ok).toBe(false)
  })

  it('parses all types, grouping, quoted comma/newline/escaped quote, BOM and CRLF', () => {
    const result = parseTransactionCsv(
      `\uFEFF${header}\r\n2024-02-29,지출,식비,"10,000","점심, 식사\r\n""감사"""\r\n2026-11-01,수입,급여,50000,\r\n2026-11-02,저축,적금,100,적금\r\n2026-11-03,투자,주식,50,주식\r\n`,
      categories,
    )
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows.map((row) => row.type)).toEqual([
      'expense',
      'income',
      'saving',
      'investment',
    ])
    expect(result.value.rows[0]).toMatchObject({
      line: 2,
      txnDate: '2024-02-29',
      amount: 10000,
      memo: '점심, 식사\n"감사"',
    })
    expect(result.value.rows[1]).toMatchObject({ line: 4, memo: null })
  })

  it.each([
    '2026-02-29',
    '1900-02-29',
    '2026-04-31',
    '2026-00-10',
    '2026-13-01',
    '2026-01-00',
    '0000-01-01',
    '2026-1-01',
    '2026/01/01',
  ])('rejects invalid date %s without JS rollover', (date) => {
    const result = parse(`${date},지출,식비,1,`)
    expect(result.ok).toBe(false)
    if (!result.ok)
      expect(result.errors).toContainEqual(expect.objectContaining({ line: 2, field: '날짜' }))
  })
  it.each(['2000-02-29', '0001-01-01', '9999-12-31'])('accepts calendar boundary %s', (date) => {
    expect(parse(`${date},지출,식비,1,`).ok).toBe(true)
  })

  it.each([
    '0',
    '-1',
    '1.1',
    '1e3',
    'NaN',
    'Infinity',
    '₩100',
    '1 000',
    '9007199254740992',
    '"1,00"',
    '"1000,000"',
    '',
  ])('rejects amount %s rather than silently rounding', (amount) => {
    const result = parse(`2026-01-01,지출,식비,${amount},`)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.errors).toContainEqual(expect.objectContaining({ field: '금액' }))
  })

  it('allows the maximum safe integer and counts Unicode memo characters like Postgres', () => {
    expect(parse(`2026-01-01,지출,식비,9007199254740991,${'😀'.repeat(200)}`).ok).toBe(true)
    expect(parse(`2026-01-01,지출,식비,1,${'😀'.repeat(201)}`).ok).toBe(false)
  })

  it('reports all row errors, requires active matching categories, and never returns a partial import', () => {
    const result = parse(
      '2026-01-01,지출,식비,1,\n2026-02-30,현금,이전,-1,\n2026-01-01,수입,식비,2,\n2026-01-01,지출,새이름,2,',
    )
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.errors.map((issue) => issue.line)).toEqual([3, 3, 3, 3, 4, 5])
      expect(result).not.toHaveProperty('value')
    }
  })

  it.each([
    `날짜,구분,카테고리,금액,출처\n2026-01-01,지출,식비,1,`,
    `${header}\n2026-01-01,지출,식비,1`,
    `${header}\n2026-01-01,지출,식비,1,,extra`,
    `${header}\n2026-01-01,지출,식비,1,"unclosed`,
    `${header}\n2026-01-01,지출,식비,1,un"quoted`,
    `${header}\n2026-01-01,지출,식비,1,"closed"junk`,
    `${header}\n,,,,`,
    `${header}\n2026-01-01,지출,식비,1,\u0000`,
    '',
  ])('rejects malformed CSV or unknown columns', (text) => {
    expect(parseTransactionCsv(text, categories).ok).toBe(false)
  })

  it('enforces bounded file bytes and rows', () => {
    expect(parse('2026-01-01,지출,식비,1,\n'.repeat(CSV_MAX_ROWS)).ok).toBe(true)
    expect(parse('2026-01-01,지출,식비,1,\n'.repeat(CSV_MAX_ROWS + 1)).ok).toBe(false)
    expect(parse('가'.repeat(CSV_MAX_BYTES / 2)).ok).toBe(false)
  })

  it('warns about identical file rows and existing transactions without dropping either', () => {
    const result = parse('2026-01-01,지출,식비,100,점심\n2026-01-01,지출,식비,100,점심')
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.rows).toHaveLength(2)
    expect(result.value.warnings).toEqual([expect.objectContaining({ line: 3, field: '중복' })])
    const warnings = existingImportWarnings(result.value.rows, [
      { ...result.value.rows[0], id: 'existing' } as unknown as Transaction,
    ])
    expect(warnings.map((warning) => warning.line)).toEqual([2, 3])
  })

  it('rejects ambiguous trimmed category names rather than choosing the first', () => {
    const result = parseTransactionCsv(`${header}\n2026-01-01,지출,식비,1,`, [
      ...categories,
      { ...categories[0], id: 'other', name: ' 식비 ' },
    ])
    expect(result.ok).toBe(false)
  })
})
