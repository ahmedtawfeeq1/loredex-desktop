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
import { insertScanRows, readScanRows } from './db/contract-scan'
import {
  capDiff,
  computeLinks,
  DIFF_CAP_BYTES,
  diffArgs,
  discoverContractFiles,
  extractShaMentions,
  globToRegExp,
  type HandoffNoteView,
  handoffNoteViews,
  isCommitSha,
  mentionedOnly,
  timelineWithLinks,
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

// ── link tiers (story 11.3: mentioned vs heuristic, tier ALWAYS labeled) ────

describe('extractShaMentions (word-bounded 7–40 hex)', () => {
  it('6 hex never matches; 7 and 40 hex do', () => {
    expect(extractShaMentions('see abc123 for detail')).toEqual([])
    expect(extractShaMentions('see abc1234 for detail')).toEqual(['abc1234'])
    expect(extractShaMentions(`full ${'d'.repeat(40)} sha`)).toEqual(['d'.repeat(40)])
  })

  it('embedded-in-word never matches; case folds; dedupes', () => {
    expect(extractShaMentions('xdeadbeef1x')).toEqual([])
    expect(extractShaMentions(`${'e'.repeat(41)}`)).toEqual([]) // 41 hex = not a sha token
    expect(extractShaMentions('DeadBeef1 and deadbeef1')).toEqual(['deadbeef1'])
  })

  it('matches inside ordinary prose punctuation (word boundaries)', () => {
    expect(extractShaMentions('landed in 839fd5d.')).toEqual(['839fd5d'])
    expect(extractShaMentions('(commit 839fd5d)')).toEqual(['839fd5d'])
  })
})

describe('computeLinks', () => {
  const sha = '839fd5d' + 'a'.repeat(33)
  const change = { sha, project: 'backend', date: '2026-07-09T22:00:00+03:00' }
  const note = (over: Partial<HandoffNoteView>): HandoffNoteView => ({
    id: 'h1',
    projects: ['backend', 'frontend'],
    date: '2026-07-08',
    text: 'objective text',
    ...over,
  })

  it('mentioned: a 7-hex prefix of the change sha in the note text', () => {
    const links = computeLinks([change], [note({ text: 'shipped in 839fd5d today' })])
    expect(links.get(sha)).toEqual([{ handoffId: 'h1', confidence: 'mentioned' }])
  })

  it('heuristic: same project + same calendar date; labeled explicitly', () => {
    const links = computeLinks([change], [note({ date: '2026-07-09' })])
    expect(links.get(sha)).toEqual([{ handoffId: 'h1', confidence: 'heuristic' }])
  })

  it('heuristic matrix: project mismatch or date mismatch → no link', () => {
    expect(
      computeLinks([change], [note({ date: '2026-07-09', projects: ['mobile'] })]).get(sha),
    ).toEqual([])
    expect(computeLinks([change], [note({ date: '2026-07-08' })]).get(sha)).toEqual([])
    expect(computeLinks([change], [note({ date: '' })]).get(sha)).toEqual([])
  })

  it('a note qualifying for both tiers gets mentioned ONLY; mentioned sorts first', () => {
    const both = note({ date: '2026-07-09', text: `did it in ${sha}` })
    expect(computeLinks([change], [both]).get(sha)).toEqual([
      { handoffId: 'h1', confidence: 'mentioned' },
    ])
    const links = computeLinks(
      [change],
      [note({ id: 'h-day', date: '2026-07-09' }), note({ id: 'h-named', text: sha })],
    ).get(sha)
    expect(links?.map((l) => l.handoffId)).toEqual(['h-named', 'h-day'])
  })

  it('a short mention never links a DIFFERENT sha (prefix rule)', () => {
    const other = { sha: 'f3a398e' + 'b'.repeat(33), project: 'backend', date: '2026-01-01T00:00:00Z' }
    const links = computeLinks([change, other], [note({ text: 'about 839fd5d only' })])
    expect(links.get(other.sha)).toEqual([])
  })
})

describe('mentionedOnly (AC4 guardrail — notify/suggest gate)', () => {
  it('heuristic links cannot pass, by construction', () => {
    const filtered = mentionedOnly([
      { handoffId: 'a', confidence: 'heuristic' },
      { handoffId: 'b', confidence: 'mentioned' },
    ])
    expect(filtered).toEqual([{ handoffId: 'b', confidence: 'mentioned' }])
    // the returned type only admits 'mentioned' — this line type-checks only
    // because the tier is narrowed:
    const tier: 'mentioned' = filtered[0]!.confidence
    expect(tier).toBe('mentioned')
  })
})

describe('timelineWithLinks + handoffNoteViews', () => {
  it('populates links from cached rows + note content, derived only', () => {
    const db = openAppDb(tmp('loredex-contracts-db-'))
    const sha = '1234abc' + 'c'.repeat(33)
    insertScanRows(db, '/repos/backend', 'openapi.yaml', [
      {
        sha,
        committedAt: '2026-07-09T10:00:00+02:00',
        summary: { adds: 5, dels: 1, subject: 'feat', author: 'Dana' },
      },
    ])
    const cards = [
      {
        id: '2026-07-09-handoff-backend',
        from: 'backend',
        to: 'frontend',
        objective: `API v2 landed in 1234abc`,
        date: '2026-07-01',
        path: '/vault/projects/frontend/handoffs/2026-07-09-handoff-backend.md',
      } as unknown as import('../shared/types').HandoffCard,
    ]
    const notes = handoffNoteViews(cards, () => null) // body unreadable → objective still scans
    const timeline = timelineWithLinks(db, { '/repos/backend': { name: 'backend' } }, notes)
    expect(timeline[0]?.links).toEqual([
      { handoffId: '2026-07-09-handoff-backend', confidence: 'mentioned' },
    ])
    db.close()
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
    expect(timeline.every((c) => c.commitBase === null)).toBe(true) // 12.1: default = no base
    // story 12.1: rows carry the per-repo base from the injected derivation
    const linked = readTimeline(db, roots, undefined, () => 'https://github.com/acme/backend')
    expect(linked.every((c) => c.commitBase === 'https://github.com/acme/backend')).toBe(true)
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
