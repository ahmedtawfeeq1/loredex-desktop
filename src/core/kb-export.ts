/**
 * Export a client's knowledge base to one .xlsx — a sheet per table.
 *
 * The knowledge base is what grounds the AI's factual answers, and it is the
 * thing a client most often wants to review or hand back edited. Reviewing it
 * meant opening N separate CSVs; there was no single artefact to send anyone.
 *
 * Source is the vault's `knowledge_tables/`, which is where both the platform
 * mirror and hand-dropped CSVs land. That keeps the export honest: it exports
 * what this dex actually holds, and says so, rather than implying it re-read
 * the platform.
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { buildXlsx, type Sheet } from './xlsx'

/**
 * RFC4180-ish CSV parse: quoted fields, doubled quotes, embedded newlines, and
 * CRLF. Written out rather than pulled in because knowledge tables are hand-
 * edited in Excel and Google Sheets, both of which emit exactly this.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = 0
  // a BOM from Excel would otherwise become part of the first header
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text

  while (i < src.length) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        quoted = false
        i++
        continue
      }
      field += ch
      i++
      continue
    }
    if (ch === '"') {
      quoted = true
      i++
      continue
    }
    if (ch === ',') {
      row.push(field)
      field = ''
      i++
      continue
    }
    if (ch === '\r' || ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += ch === '\r' && src[i + 1] === '\n' ? 2 : 1
      continue
    }
    field += ch
    i++
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  // a trailing newline should not become a row of one empty cell
  return rows.filter((r) => r.some((c) => c !== '') || r.length > 1)
}

export interface KbExportResult {
  /** vault-relative path of the written workbook */
  rel: string
  tables: { name: string; rows: number; columns: number }[]
  /** tables found but not exported, with why */
  skipped: { name: string; reason: string }[]
}

/** `patients.csv` → `patients`. */
function tableName(file: string): string {
  return file.replace(/\.[^.]+$/, '')
}

/**
 * Build the workbook for one client. Returns the bytes and a summary; the
 * caller decides where to put them, so this stays testable without a vault.
 */
export function buildKbWorkbook(
  vaultPath: string,
  client: string,
): { buffer: Buffer; tables: KbExportResult['tables']; skipped: KbExportResult['skipped'] } {
  const dir = join(vaultPath, 'projects', client, 'knowledge_tables')
  if (!existsSync(dir)) throw new Error(`no knowledge_tables/ for client "${client}"`)

  const files = readdirSync(dir)
    .filter((f) => !f.startsWith('.') && /\.csv$/i.test(f))
    .sort()

  const sheets: Sheet[] = []
  const tables: KbExportResult['tables'] = []
  const skipped: KbExportResult['skipped'] = []

  for (const file of files) {
    let rows: string[][]
    try {
      rows = parseCsv(readFileSync(join(dir, file), 'utf8'))
    } catch (e) {
      skipped.push({ name: file, reason: e instanceof Error ? e.message : 'unreadable' })
      continue
    }
    if (rows.length === 0) {
      skipped.push({ name: file, reason: 'empty file' })
      continue
    }
    sheets.push({ name: tableName(file), rows })
    tables.push({
      name: tableName(file),
      rows: Math.max(0, rows.length - 1), // the header is not a data row
      columns: rows[0]?.length ?? 0,
    })
  }

  if (sheets.length === 0) {
    // an .xlsx with no sheets will not open; say why instead of writing a dud
    throw new Error(
      files.length === 0
        ? `client "${client}" has no knowledge tables to export`
        : `client "${client}" has ${files.length} knowledge table file(s), none of them readable`,
    )
  }

  return { buffer: buildXlsx(sheets), tables, skipped }
}
