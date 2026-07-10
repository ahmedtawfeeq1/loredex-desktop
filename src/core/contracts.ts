/**
 * Contract intelligence (epic 11, architecture-m2.md §5) — read-only, app-side
 * by design: no vault writes means core-host code, NOT lib exports (the
 * anti-second-engine rule governs vault markdown, which is never touched here).
 *
 * Story 11.1: root precedence, the fixed glob set + user globs, incremental
 * `git log --follow --numstat` per matched file cached in app-db contract_scan,
 * and the merged date-sorted timeline. Everything against the repos is
 * read-only — never a worktree diff, never a write.
 */
import { readdirSync } from 'node:fs'
import type { ContractChange, ProjectRootsMap } from '../shared/types'
import { type AppDb, appSettingGet, appSettingSet } from './db/index'
import { insertScanRows, newestScanSha, readScanRows, type ScanRow } from './db/contract-scan'

// ── root discovery precedence (m2 §5 — decided verbatim) ────────────────────

/**
 * config.projects wins when non-empty AND the config file's vaultPath matches
 * the open vault; else the app-db `project_roots` map. Config is never written
 * back; the app map never overrides a matching config.
 */
export function resolveRoots(opts: {
  openVaultPath: string
  /** the loredex config file as loaded (pre-picker-override); null = none */
  fileConfig: { vaultPath: string; projects: ProjectRootsMap } | null
  /** app-db `project_roots` for this vault; null = never set */
  appRoots: ProjectRootsMap | null
}): { roots: ProjectRootsMap; fromConfig: boolean } {
  const { fileConfig } = opts
  if (
    fileConfig &&
    Object.keys(fileConfig.projects).length > 0 &&
    fileConfig.vaultPath === opts.openVaultPath
  ) {
    return { roots: fileConfig.projects, fromConfig: true }
  }
  return { roots: opts.appRoots ?? {}, fromConfig: false }
}

// ── contract file matching (fixed pattern set + user globs) ─────────────────

/** The decided pattern set (m2 §5), case-insensitive. Patterns without a `/`
 *  match the file basename anywhere under the root. */
export const FIXED_CONTRACT_GLOBS: readonly string[] = [
  'openapi*.y?(a)ml',
  '*openapi*.json',
  'postman*collection*.json',
  '**/*.graphql',
]

/** Always excluded, at any depth (m2 §5). */
export const EXCLUDED_DIRS: ReadonlySet<string> = new Set(['.git', 'node_modules'])

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Minimal glob → RegExp (case-insensitive, anchored). Supports `*` (segment),
 * `**` (spans separators; a following `/` folds in), `?` (one char) and the
 * one extglob the fixed set needs: `?(x)` = optional literal.
 */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string
    if (c === '*') {
      if (glob[i + 1] === '*') {
        re += '.*'
        i++
        if (glob[i + 1] === '/') i++
      } else {
        re += '[^/]*'
      }
    } else if (c === '?' && glob[i + 1] === '(') {
      const close = glob.indexOf(')', i + 2)
      if (close === -1) {
        re += escapeRe(c) // unterminated — treat literally
      } else {
        re += `(?:${escapeRe(glob.slice(i + 2, close))})?`
        i = close
      }
    } else if (c === '?') {
      re += '[^/]'
    } else {
      re += escapeRe(c)
    }
  }
  return new RegExp(`^${re}$`, 'i')
}

/** Does a repo-relative path match the fixed set + user globs? */
export function matchesContractFile(relPath: string, userGlobs: readonly string[]): boolean {
  const basename = relPath.split('/').pop() ?? relPath
  for (const glob of [...FIXED_CONTRACT_GLOBS, ...userGlobs]) {
    const target = glob.includes('/') ? relPath : basename
    if (globToRegExp(glob).test(target)) return true
  }
  return false
}

/** Recursive repo walk (rel posix paths); `.git/` + `node_modules/` excluded
 *  at any depth, symlinked dirs never followed (no cycles, no cold surprises). */
export function listRepoFiles(rootAbs: string): string[] {
  const files: string[] = []
  const walk = (dirAbs: string, rel: string): void => {
    for (const entry of readdirSync(dirAbs, { withFileTypes: true })) {
      const childRel = rel ? `${rel}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (!EXCLUDED_DIRS.has(entry.name.toLowerCase())) walk(`${dirAbs}/${entry.name}`, childRel)
      } else if (entry.isFile()) {
        files.push(childRel)
      }
    }
  }
  walk(rootAbs, '')
  return files
}

export function discoverContractFiles(rootAbs: string, userGlobs: readonly string[]): string[] {
  return listRepoFiles(rootAbs).filter((rel) => matchesContractFile(rel, userGlobs))
}

// ── git log scan (incremental, cached in contract_scan) ─────────────────────

/** %x1e record sep, %x1f field sep: sha, committer date ISO, author, subject. */
export const SCAN_LOG_FORMAT = '%x1e%H%x1f%cI%x1f%an%x1f%s'

/** Incremental discipline (AC3): only log since the newest cached sha. */
export function scanLogArgs(file: string, sinceSha: string | null): string[] {
  return [
    'log',
    '--follow',
    '--numstat',
    `--format=${SCAN_LOG_FORMAT}`,
    ...(sinceSha ? [`${sinceSha}..HEAD`] : []),
    '--',
    file,
  ]
}

/** Parse the token-separated log into cache rows. A record is the header
 *  fields, then numstat lines `adds\tdels\tpath` ('-' = binary; merge commits
 *  may have none). Malformed records are skipped, never crash the scan. */
export function parseScanLog(raw: string): ScanRow[] {
  const rows: ScanRow[] = []
  for (const record of raw.split('\x1e')) {
    if (!record.trim()) continue
    const [head = '', ...rest] = record.split('\n')
    const fields = head.split('\x1f')
    const [sha = '', committedAt = '', author = '', subject = ''] = fields
    if (!/^[0-9a-f]{40}$/.test(sha)) continue
    let adds: number | null = null
    let dels: number | null = null
    for (const line of rest) {
      const m = /^(\d+|-)\t(\d+|-)\t/.exec(line)
      if (!m) continue
      adds = m[1] === '-' ? null : Number(m[1])
      dels = m[2] === '-' ? null : Number(m[2])
      break // --follow on one file: the first numstat line is the file's
    }
    rows.push({ sha, committedAt, summary: { adds, dels, subject, author } })
  }
  return rows
}

/** A row the scan newly cached — the `contract.changed` event material. */
export interface NewContractRow {
  repoRoot: string
  project: string
  file: string
  sha: string
  date: string
}

export interface ContractScanDeps {
  db: AppDb
  roots: ProjectRootsMap
  userGlobs: readonly string[]
  /** async git runner, read-only args only (git.ts gitAsync) */
  git(cwd: string, args: readonly string[]): Promise<string>
  /** test seam; defaults to the real walk */
  listFiles?(rootAbs: string): string[]
}

/**
 * Scan every registered root: discover contract files, incremental git log per
 * file, cache new rows. Missing roots and non-repos are skipped honestly; a
 * rewritten history (incremental range fails) falls back to one full re-log —
 * INSERT OR IGNORE keeps that idempotent. Returns only the newly cached rows.
 */
export async function scanContracts(deps: ContractScanDeps): Promise<NewContractRow[]> {
  const list = deps.listFiles ?? listRepoFiles
  const fresh: NewContractRow[] = []
  for (const [root, { name }] of Object.entries(deps.roots)) {
    let files: string[]
    try {
      files = list(root).filter((rel) => matchesContractFile(rel, deps.userGlobs))
    } catch {
      continue // root absent on this machine — the timeline shows what it has
    }
    for (const file of files) {
      const since = newestScanSha(deps.db, root, file)
      let raw: string
      try {
        raw = await deps.git(root, scanLogArgs(file, since))
      } catch {
        if (since === null) continue // not a git repo / untracked file
        try {
          raw = await deps.git(root, scanLogArgs(file, null))
        } catch {
          continue
        }
      }
      for (const row of insertScanRows(deps.db, root, file, parseScanLog(raw))) {
        fresh.push({ repoRoot: root, project: name, file, sha: row.sha, date: row.committedAt })
      }
    }
  }
  return fresh
}

// ── the timeline (merged, date-sorted — AC4) ────────────────────────────────

export function readTimeline(
  db: AppDb,
  roots: ProjectRootsMap,
  project?: string,
): ContractChange[] {
  const changes: ContractChange[] = []
  for (const [root, { name }] of Object.entries(roots)) {
    if (project && name !== project) continue
    for (const row of readScanRows(db, root)) {
      changes.push({
        repoRoot: root,
        project: name,
        file: row.file,
        sha: row.sha,
        date: row.committedAt,
        author: row.summary.author,
        subject: row.summary.subject,
        adds: row.summary.adds,
        dels: row.summary.dels,
        links: [], // story 11.3 computes the tiers
      })
    }
  }
  // newest first (epoch compare — %cI carries tz offsets, string order lies
  // across repos); sha tiebreak keeps the order deterministic across runs
  const epoch = (c: ContractChange): number => {
    const t = Date.parse(c.date)
    return Number.isNaN(t) ? 0 : t
  }
  changes.sort((a, b) => epoch(b) - epoch(a) || (a.sha < b.sha ? -1 : 1))
  return changes
}

// ── app-db settings (project_roots / contract_globs, per vault — m2 §3) ─────

const ROOTS_KEY = 'project_roots'
const GLOBS_KEY = 'contract_globs'

export function sanitizeRoots(value: unknown): ProjectRootsMap {
  const roots: ProjectRootsMap = {}
  if (typeof value !== 'object' || value === null) return roots
  for (const [path, entry] of Object.entries(value as Record<string, unknown>)) {
    const name = (entry as { name?: unknown } | null)?.name
    if (path && typeof name === 'string' && name.trim()) roots[path] = { name: name.trim() }
  }
  return roots
}

export function sanitizeGlobs(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return [...new Set(value.filter((g): g is string => typeof g === 'string' && g.trim() !== '').map((g) => g.trim()))]
}

export function loadProjectRoots(db: AppDb, vaultId: string): ProjectRootsMap | null {
  const raw = appSettingGet(db, vaultId, ROOTS_KEY)
  if (raw === null) return null
  try {
    return sanitizeRoots(JSON.parse(raw))
  } catch {
    return null
  }
}

export function saveProjectRoots(db: AppDb, vaultId: string, roots: ProjectRootsMap): void {
  appSettingSet(db, vaultId, ROOTS_KEY, JSON.stringify(sanitizeRoots(roots)))
}

export function loadContractGlobs(db: AppDb, vaultId: string): string[] {
  const raw = appSettingGet(db, vaultId, GLOBS_KEY)
  if (raw === null) return []
  try {
    return sanitizeGlobs(JSON.parse(raw))
  } catch {
    return []
  }
}

export function saveContractGlobs(db: AppDb, vaultId: string, globs: string[]): void {
  appSettingSet(db, vaultId, GLOBS_KEY, JSON.stringify(sanitizeGlobs(globs)))
}
