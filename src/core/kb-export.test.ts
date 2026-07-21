/**
 * The knowledge-base export. The workbook is built in memory and inspected as a
 * real ZIP, because "it produced a file" is not the bar — Excel refusing to open
 * it is the failure mode that matters, and that comes from malformed XML or a
 * broken central directory, neither of which a byte-count assertion would see.
 */
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { inflateRawSync } from 'node:zlib'
import { beforeEach, describe, expect, it } from 'vitest'
import { buildKbWorkbook, parseCsv } from './kb-export'
import { buildXlsx, columnRef, sheetName } from './xlsx'

let vault: string
const tablesDir = (client: string): string =>
  join(vault, 'projects', client, 'knowledge_tables')

function table(client: string, name: string, body: string): void {
  const dir = tablesDir(client)
  mkdirSync(dir, { recursive: true })
  writeFileSync(join(dir, name), body)
}

/** Read one entry back out of the zip, so the assertions are on real content. */
function unzip(buf: Buffer): Map<string, string> {
  const out = new Map<string, string>()
  let i = 0
  while (i < buf.length - 4) {
    if (buf.readUInt32LE(i) !== 0x04034b50) break
    const compSize = buf.readUInt32LE(i + 18)
    const nameLen = buf.readUInt16LE(i + 26)
    const extraLen = buf.readUInt16LE(i + 28)
    const name = buf.subarray(i + 30, i + 30 + nameLen).toString('utf8')
    const start = i + 30 + nameLen + extraLen
    out.set(name, inflateRawSync(buf.subarray(start, start + compSize)).toString('utf8'))
    i = start + compSize
  }
  return out
}

beforeEach(() => {
  vault = mkdtempSync(join(tmpdir(), 'loredex-kb-'))
})

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and newlines inside fields', () => {
    expect(parseCsv('a,b\n"x,1","he said ""hi"""\n')).toEqual([
      ['a', 'b'],
      ['x,1', 'he said "hi"'],
    ])
    expect(parseCsv('a,b\n"line\none",2\n')).toEqual([
      ['a', 'b'],
      ['line\none', '2'],
    ])
  })

  it('handles CRLF and strips the BOM Excel writes', () => {
    expect(parseCsv('﻿a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2'],
    ])
  })

  it('a trailing newline is not a row', () => {
    expect(parseCsv('a\n1\n')).toEqual([['a'], ['1']])
  })
})

describe('xlsx primitives', () => {
  it('columnRef rolls over past Z', () => {
    expect([0, 25, 26, 27, 51, 52].map(columnRef)).toEqual(['A', 'Z', 'AA', 'AB', 'AZ', 'BA'])
  })

  it('sheetName strips forbidden characters, caps at 31, and de-duplicates', () => {
    expect(sheetName('a/b:c*d?e[f]g')).toBe('a-b-c-d-e-f-g')
    expect(sheetName('x'.repeat(60))).toHaveLength(31)
    const taken = new Set<string>()
    expect([sheetName('orders', taken), sheetName('orders', taken)]).toEqual([
      'orders',
      'orders (2)',
    ])
  })

  it('refuses to build a workbook with no sheets — Excel will not open one', () => {
    expect(() => buildXlsx([])).toThrow(/at least one sheet/)
  })
})

describe('buildKbWorkbook', () => {
  it('writes one sheet per table, header row first, and counts data rows', () => {
    table('acme', 'patients.csv', 'name,phone\nAda,123\nGrace,456\n')
    table('acme', 'faq.csv', 'q,a\nhours?,9-5\n')
    const r = buildKbWorkbook(vault, 'acme')

    // alphabetical, and the header is not counted as data
    expect(r.tables).toEqual([
      { name: 'faq', rows: 1, columns: 2 },
      { name: 'patients', rows: 2, columns: 2 },
    ])

    const parts = unzip(r.buffer)
    expect(parts.has('[Content_Types].xml')).toBe(true)
    expect(parts.has('xl/workbook.xml')).toBe(true)
    expect(parts.get('xl/workbook.xml')).toContain('name="patients"')
    // sheet1 is faq (alphabetical), sheet2 patients
    expect(parts.get('xl/worksheets/sheet2.xml')).toContain('Grace')
    // a phone number that is all digits is written as a number, not a string
    expect(parts.get('xl/worksheets/sheet2.xml')).toContain('<v>123</v>')
  })

  it('escapes XML rather than producing a file Excel refuses', () => {
    // `""c""` inside a quoted field is CSV for a literal `"c"`
    table('acme', 't.csv', 'a\n"<b> & ""c"""\n')
    const sheet = unzip(buildKbWorkbook(vault, 'acme').buffer).get('xl/worksheets/sheet1.xml')
    expect(sheet).toContain('&lt;b&gt; &amp; &quot;c&quot;')
    expect(sheet).not.toContain('<b>')
  })

  it('is deterministic — the same tables produce the same bytes', () => {
    table('acme', 't.csv', 'a,b\n1,2\n')
    expect(buildKbWorkbook(vault, 'acme').buffer.equals(buildKbWorkbook(vault, 'acme').buffer)).toBe(
      true,
    )
  })

  it('skips an empty table instead of emitting a sheet that opens blank', () => {
    table('acme', 'good.csv', 'a\n1\n')
    table('acme', 'empty.csv', '')
    const r = buildKbWorkbook(vault, 'acme')
    expect(r.tables.map((t) => t.name)).toEqual(['good'])
    expect(r.skipped).toEqual([{ name: 'empty.csv', reason: 'empty file' }])
  })

  it('explains itself rather than writing a workbook that cannot open', () => {
    mkdirSync(tablesDir('bare'), { recursive: true })
    expect(() => buildKbWorkbook(vault, 'bare')).toThrow(/no knowledge tables/)
    expect(() => buildKbWorkbook(vault, 'nope')).toThrow(/no knowledge_tables/)
  })
})
