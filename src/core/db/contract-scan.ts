/**
 * contract_scan cache access (story 11.1). The table ships with the M2 schema
 * (db/index.ts migration 1); this module owns its read/write logic. Rows are a
 * CACHE of git-log truth — disposable by contract, rebuilt by a full rescan.
 */
import type { AppDb } from './index'

/** summary_json payload: adds/dels, subject, author (architecture-m2.md §3). */
export interface ScanSummary {
  /** numstat counts; null = git reported '-' (binary) or no numstat line */
  adds: number | null
  dels: number | null
  subject: string
  author: string
}

export interface ScanRow {
  sha: string
  /** committer date, ISO (%cI) — the incremental cutoff orders by it */
  committedAt: string
  summary: ScanSummary
}

export interface CachedScanRow extends ScanRow {
  /** repo-relative file path */
  file: string
}

/** Newest cached sha per (repo_root, file) — the incremental-scan cutoff. */
export function newestScanSha(db: AppDb, repoRoot: string, file: string): string | null {
  const row = db
    .prepare(
      `SELECT commit_sha FROM contract_scan WHERE repo_root = ? AND file = ?
       ORDER BY committed_at DESC LIMIT 1`,
    )
    .get(repoRoot, file) as { commit_sha: string } | undefined
  return row?.commit_sha ?? null
}

/**
 * INSERT OR IGNORE the parsed log rows; returns only the rows that were
 * actually new (the post-integrate `contract.changed` event material — a
 * re-scan of known history emits nothing).
 */
export function insertScanRows(
  db: AppDb,
  repoRoot: string,
  file: string,
  rows: ScanRow[],
): ScanRow[] {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO contract_scan (repo_root, file, commit_sha, committed_at, summary_json)
     VALUES (?, ?, ?, ?, ?)`,
  )
  const fresh: ScanRow[] = []
  db.transaction(() => {
    for (const row of rows) {
      const result = stmt.run(repoRoot, file, row.sha, row.committedAt, JSON.stringify(row.summary))
      if (result.changes > 0) fresh.push(row)
    }
  })()
  return fresh
}

/** Every cached row for one repo root; a malformed summary degrades honestly. */
export function readScanRows(db: AppDb, repoRoot: string): CachedScanRow[] {
  const rows = db
    .prepare(
      'SELECT file, commit_sha, committed_at, summary_json FROM contract_scan WHERE repo_root = ?',
    )
    .all(repoRoot) as Array<{
    file: string
    commit_sha: string
    committed_at: string
    summary_json: string
  }>
  return rows.map((row) => ({
    file: row.file,
    sha: row.commit_sha,
    committedAt: row.committed_at,
    summary: parseSummary(row.summary_json),
  }))
}

function parseSummary(raw: string): ScanSummary {
  try {
    const parsed = JSON.parse(raw) as Partial<ScanSummary>
    return {
      adds: typeof parsed.adds === 'number' ? parsed.adds : null,
      dels: typeof parsed.dels === 'number' ? parsed.dels : null,
      subject: typeof parsed.subject === 'string' ? parsed.subject : '',
      author: typeof parsed.author === 'string' ? parsed.author : '',
    }
  } catch {
    return { adds: null, dels: null, subject: '', author: '' }
  }
}
