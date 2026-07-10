/**
 * Story 11.1: contract discovery + change timeline. Precedence matrix, glob
 * matching (fixed set, exclusions, user globs, case), numstat parsing, the
 * incremental cutoff, and a real fixture repo scanned twice.
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { openAppDb } from './db/index'
import { readScanRows } from './db/contract-scan'
import {
  capDiff,
  DIFF_CAP_BYTES,
  diffArgs,
  discoverContractFiles,
  globToRegExp,
  isCommitSha,
  loadContractGlobs,
  loadProjectRoots,
  matchesContractFile,
  parseScanLog,
  readTimeline,
  resolveRoots,
  sanitizeGlobs,
  sanitizeRoots,
  saveContractGlobs,
  saveProjectRoots,
  scanContracts,
  scanLogArgs,
} from './contracts'
import { gitAsync } from './git'

const tmp = (prefix: string): string => mkdtempSync(join(tmpdir(), prefix))

// ── precedence matrix (AC1) ─────────────────────────────────────────────────

describe('resolveRoots precedence', () => {
  const configProjects = { '/repos/backend': { name: 'backend' } }
  const appRoots = { '/other/frontend': { name: 'frontend' } }

  it('config wins when non-empty and its vaultPath matches the open vault', () => {
    expect(
      resolveRoots({
        openVaultPath: '/vault',
        fileConfig: { vaultPath: '/vault', projects: configProjects },
        appRoots,
      }),
    ).toEqual({ roots: configProjects, fromConfig: true })
  })

  it('config vaultPath mismatch → app-db roots', () => {
    expect(
      resolveRoots({
        openVaultPath: '/picked/other-vault',
        fileConfig: { vaultPath: '/vault', projects: configProjects },
        appRoots,
      }),
    ).toEqual({ roots: appRoots, fromConfig: false })
  })

  it('empty config projects → app-db roots; no app roots → empty map', () => {
    expect(
      resolveRoots({
        openVaultPath: '/vault',
        fileConfig: { vaultPath: '/vault', projects: {} },
        appRoots,
      }),
    ).toEqual({ roots: appRoots, fromConfig: false })
    expect(
      resolveRoots({ openVaultPath: '/vault', fileConfig: null, appRoots: null }),
    ).toEqual({ roots: {}, fromConfig: false })
  })
})

// ── glob matching (AC2) ─────────────────────────────────────────────────────

describe('contract glob matching', () => {
  it('fixed set matches the decided patterns, case-insensitive', () => {
    for (const rel of [
      'openapi.yaml',
      'openapi.yml',
      'OpenAPI.YAML',
      'openapi-v2.yaml',
      'docs/openapi.yaml', // basename pattern matches at any depth
      'spec.openapi.json',
      'postman_collection.json',
      'Postman Collection.json',
      'schema.graphql',
      'src/schema/user.graphql',
    ]) {
      expect(matchesContractFile(rel, []), rel).toBe(true)
    }
  })

  it('non-contract files do not match', () => {
    for (const rel of ['readme.md', 'openapi.txt', 'api.yaml', 'postman.json', 'graphql.ts']) {
      expect(matchesContractFile(rel, []), rel).toBe(false)
    }
  })

  it('?(a) extglob makes exactly the y(a)ml pair', () => {
    const re = globToRegExp('openapi*.y?(a)ml')
    expect(re.test('openapi.yml')).toBe(true)
    expect(re.test('openapi.yaml')).toBe(true)
    expect(re.test('openapi.yaaml')).toBe(false)
  })

  it('user globs add patterns: path globs match rel path, bare match basename', () => {
    expect(matchesContractFile('contracts/v1/user.proto', ['contracts/**/*.proto'])).toBe(true)
    expect(matchesContractFile('src/user.proto', ['contracts/**/*.proto'])).toBe(false)
    expect(matchesContractFile('deep/dir/api.raml', ['*.raml'])).toBe(true)
  })

  it('discovery walks the tree but never .git/ or node_modules/', () => {
    const root = tmp('loredex-contracts-')
    mkdirSync(join(root, 'docs'), { recursive: true })
    mkdirSync(join(root, '.git'), { recursive: true })
    mkdirSync(join(root, 'node_modules', 'dep'), { recursive: true })
    writeFileSync(join(root, 'openapi.yaml'), 'openapi: 3.1.0\n')
    writeFileSync(join(root, 'docs', 'schema.graphql'), 'type Query\n')
    writeFileSync(join(root, '.git', 'openapi.yaml'), 'not a contract\n')
    writeFileSync(join(root, 'node_modules', 'dep', 'openapi.yaml'), 'not yours\n')
    expect(discoverContractFiles(root, []).sort()).toEqual(['docs/schema.graphql', 'openapi.yaml'])
  })
})

// ── log parsing + incremental cutoff (AC3) ──────────────────────────────────

describe('scan log parsing', () => {
  const record = (sha: string, date: string, numstat: string): string =>
    `\x1e${sha}\x1f${date}\x1f Dana Reyes \x1f feat: change \n${numstat}`

  it('parses sha, date, author, subject and the numstat counts', () => {
    const sha = 'a'.repeat(40)
    const rows = parseScanLog(`\x1e${sha}\x1f2026-07-01T10:00:00+02:00\x1fDana\x1ffeat: v2\n12\t3\topenapi.yaml\n`)
    expect(rows).toEqual([
      {
        sha,
        committedAt: '2026-07-01T10:00:00+02:00',
        summary: { adds: 12, dels: 3, subject: 'feat: v2', author: 'Dana' },
      },
    ])
  })

  it("'-' numstat (binary) → null counts; merge commit without numstat too", () => {
    const bin = parseScanLog(record('b'.repeat(40), '2026-07-01T10:00:00Z', '-\t-\tapi.bin'))
    expect(bin[0]?.summary.adds).toBeNull()
    expect(bin[0]?.summary.dels).toBeNull()
    const merge = parseScanLog(`\x1e${'c'.repeat(40)}\x1f2026-07-02T10:00:00Z\x1fD\x1fmerge\n`)
    expect(merge[0]?.summary.adds).toBeNull()
  })

  it('skips malformed records instead of crashing', () => {
    expect(parseScanLog('\x1enot-a-sha\x1fdate\x1fa\x1fs\n1\t2\tf\n\x1e\n')).toEqual([])
  })

  it('incremental args log only since the newest cached sha', () => {
    const sha = 'd'.repeat(40)
    expect(scanLogArgs('openapi.yaml', sha)).toContain(`${sha}..HEAD`)
    expect(scanLogArgs('openapi.yaml', null).join(' ')).not.toContain('..HEAD')
  })
})

// ── settings round-trip + sanitizers (AC4) ──────────────────────────────────

describe('project roots + globs settings', () => {
  it('round-trips through app_settings, sanitized', () => {
    const db = openAppDb(tmp('loredex-contracts-db-'))
    expect(loadProjectRoots(db, 'v1')).toBeNull()
    saveProjectRoots(db, 'v1', { '/repos/backend': { name: ' backend ' } })
    expect(loadProjectRoots(db, 'v1')).toEqual({ '/repos/backend': { name: 'backend' } })
    saveContractGlobs(db, 'v1', ['*.proto', '', '*.proto', ' *.raml '])
    expect(loadContractGlobs(db, 'v1')).toEqual(['*.proto', '*.raml'])
    expect(loadProjectRoots(db, 'other-vault')).toBeNull() // vault-scoped
    db.close()
  })

  it('sanitizers drop malformed entries', () => {
    expect(sanitizeRoots({ '/a': { name: 'a' }, '/b': {}, '/c': null, '': { name: 'x' } })).toEqual(
      { '/a': { name: 'a' } },
    )
    expect(sanitizeGlobs('nope')).toEqual([])
  })
})

// ── diff extraction (story 11.2: pinned to commits, capped, flagged) ────────

describe('capDiff + diffArgs', () => {
  it('small diffs pass through untouched', () => {
    expect(capDiff('+a\n-b\n')).toEqual({ unified: '+a\n-b\n', truncated: false })
  })

  it('>200 KB is cut at a line boundary and FLAGGED — never a silent cut', () => {
    const line = `+${'x'.repeat(99)}\n` // 100 bytes per line
    const big = line.repeat(2200) // 220 KB
    const { unified, truncated } = capDiff(big)
    expect(truncated).toBe(true)
    expect(Buffer.byteLength(unified, 'utf8')).toBeLessThanOrEqual(DIFF_CAP_BYTES)
    expect(unified.endsWith('\n')).toBe(true) // whole lines only
  })

  it('pins to the commit: git show <sha> -- <file>, never worktree diff', () => {
    expect(diffArgs('abc1234', 'openapi.yaml')).toEqual(['show', 'abc1234', '--', 'openapi.yaml'])
  })

  it('sha guard accepts 7–40 hex, rejects everything else', () => {
    expect(isCommitSha('abc1234')).toBe(true)
    expect(isCommitSha('A'.repeat(40))).toBe(true)
    expect(isCommitSha('abc123')).toBe(false) // 6 — too short
    expect(isCommitSha('--exec=evil')).toBe(false)
  })
})

// ── integration: fixture repo, scanned twice (AC3/AC5 material) ─────────────

/** Distinct committer dates so the date-sorted timeline is deterministic. */
function commitAt(root: string, message: string, date: string): void {
  execFileSync('git', ['add', '.'], { cwd: root, stdio: 'pipe' })
  execFileSync('git', ['commit', '-m', message], {
    cwd: root,
    stdio: 'pipe',
    env: { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date },
  })
}

function initRepo(root: string): void {
  const git = (...args: string[]): void => {
    execFileSync('git', args, { cwd: root, stdio: 'pipe' })
  }
  git('init', '-b', 'main')
  git('config', 'user.name', 'Dana Reyes')
  git('config', 'user.email', 'dana@nimbus.dev')
  writeFileSync(join(root, 'openapi.yaml'), 'openapi: 3.1.0\npaths: {}\n')
  commitAt(root, 'chore: scaffold contract', '2026-07-01T10:00:00+02:00')
  writeFileSync(join(root, 'openapi.yaml'), 'openapi: 3.1.0\npaths:\n  /users: {}\n')
  commitAt(root, 'feat(api): add /users', '2026-07-02T10:00:00+02:00')
  writeFileSync(join(root, 'openapi.yaml'), 'openapi: 3.1.0\npaths:\n  /users: {}\n  /orders: {}\n')
  commitAt(root, 'feat(api): add /orders', '2026-07-03T10:00:00+02:00')
}

describe('scanContracts against a fixture repo', () => {
  it('caches one row per commit, second scan adds none, new commit adds one', async () => {
    const root = tmp('loredex-contracts-repo-')
    initRepo(root)
    const db = openAppDb(tmp('loredex-contracts-db-'))
    const roots = { [root]: { name: 'backend' } }

    const first = await scanContracts({ db, roots, userGlobs: [], git: gitAsync })
    expect(first).toHaveLength(3)
    expect(readScanRows(db, root)).toHaveLength(3)

    const second = await scanContracts({ db, roots, userGlobs: [], git: gitAsync })
    expect(second).toHaveLength(0)

    writeFileSync(join(root, 'openapi.yaml'), 'openapi: 3.1.0\npaths:\n  /users: {}\n')
    commitAt(root, 'revert(api): drop /orders', '2026-07-04T10:00:00+02:00')
    const third = await scanContracts({ db, roots, userGlobs: [], git: gitAsync })
    expect(third).toHaveLength(1)
    expect(third[0]?.project).toBe('backend')
    expect(third[0]?.file).toBe('openapi.yaml')

    const timeline = readTimeline(db, roots)
    expect(timeline).toHaveLength(4)
    // merged, date-sorted, newest first
    expect(timeline[0]?.subject).toBe('revert(api): drop /orders')
    expect(timeline[3]?.subject).toBe('chore: scaffold contract')
    expect(timeline.every((c) => c.links.length === 0)).toBe(true) // 11.3 fills these
    expect(readTimeline(db, roots, 'other-project')).toHaveLength(0)
    db.close()
  }, 30_000)

  it('diff round-trip: git show pinned to a cached commit; a huge change truncates', async () => {
    const root = tmp('loredex-contracts-repo-')
    initRepo(root)
    const db = openAppDb(tmp('loredex-contracts-db-'))
    const roots = { [root]: { name: 'backend' } }
    const rows = await scanContracts({ db, roots, userGlobs: [], git: gitAsync })
    const usersCommit = rows.find((r) => r.sha && r.date.startsWith('2026-07-02'))
    expect(usersCommit).toBeDefined()
    const diff = capDiff(await gitAsync(root, diffArgs(usersCommit!.sha, 'openapi.yaml')))
    expect(diff.truncated).toBe(false)
    expect(diff.unified).toContain('+  /users: {}')

    // a >200 KB change comes back truncated + flagged
    const bigBody = `openapi: 3.1.0\npaths:\n${Array.from({ length: 30_000 }, (_, i) => `  /path-${i}: {}`).join('\n')}\n`
    writeFileSync(join(root, 'openapi.yaml'), bigBody)
    commitAt(root, 'feat(api): the mega change', '2026-07-05T10:00:00+02:00')
    const fresh = await scanContracts({ db, roots, userGlobs: [], git: gitAsync })
    expect(fresh).toHaveLength(1)
    const big = capDiff(await gitAsync(root, diffArgs(fresh[0]!.sha, 'openapi.yaml')))
    expect(big.truncated).toBe(true)
    expect(Buffer.byteLength(big.unified, 'utf8')).toBeLessThanOrEqual(DIFF_CAP_BYTES)
    db.close()
  }, 30_000)

  it('a missing root is skipped honestly', async () => {
    const db = openAppDb(tmp('loredex-contracts-db-'))
    const fresh = await scanContracts({
      db,
      roots: { '/does/not/exist': { name: 'ghost' } },
      userGlobs: [],
      git: gitAsync,
    })
    expect(fresh).toEqual([])
    db.close()
  })
})
