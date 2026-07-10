/**
 * Story 12.1: per-repo web-base derivation — real `git remote get-url origin`
 * output through the one shared normalization, cached per repo per session
 * (including the no-remote failure, so degraded repos never retry-storm).
 *
 * Story 12.2: gh capability detection matrix, PR lookup parse/timeout/cache,
 * and the suggestion trigger matrix — including the categorical guarantee
 * that no code path in this module writes status.
 */
import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { HandoffCard, PrInfo } from '../shared/types'
import {
  clearGithubCaches,
  detectGh,
  dismissKey,
  evaluateSuggestions,
  type ExecRunner,
  GH_TIMEOUT_MS,
  ghCapability,
  initGhCapability,
  originRemote,
  parsePrList,
  prForCommit,
  prListArgs,
  remoteWebBase,
  suggestFromFreshChanges,
} from './github'

afterEach(() => clearGithubCaches())

const NIMBUS_VAULT = resolve(
  import.meta.dirname,
  '../../../loredex-simulation/_machine2/nimbus-vault',
)

describe('originRemote / remoteWebBase (session cache)', () => {
  it('derives the base from the repo real origin and caches per repo', () => {
    const run = vi.fn(() => 'git@github.com:acme/nimbus.git\n')
    expect(remoteWebBase('/repo/a', run)).toBe('https://github.com/acme/nimbus')
    expect(remoteWebBase('/repo/a', run)).toBe('https://github.com/acme/nimbus')
    expect(run).toHaveBeenCalledTimes(1)
    expect(run).toHaveBeenCalledWith('/repo/a', ['remote', 'get-url', 'origin'])
  })

  it('caches independently per repo root', () => {
    const remotes: Record<string, string> = {
      '/repo/a': 'https://github.com/acme/aaa.git',
      '/repo/b': 'git@gitlab.com:acme/bbb.git',
    }
    const run = vi.fn((cwd: string) => remotes[cwd] ?? '')
    expect(remoteWebBase('/repo/a', run)).toBe('https://github.com/acme/aaa')
    expect(remoteWebBase('/repo/b', run)).toBeNull() // non-GitHub → plain chips
    expect(remoteWebBase('/repo/a', run)).toBe('https://github.com/acme/aaa')
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('caches the failure path too: no origin / not a repo → null, one query', () => {
    const run = vi.fn(() => {
      throw new Error('fatal: not a git repository')
    })
    expect(originRemote('/not/a/repo', run)).toBeNull()
    expect(remoteWebBase('/not/a/repo', run)).toBeNull()
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('treats empty output as no remote', () => {
    const run = vi.fn(() => '\n')
    expect(originRemote('/repo/empty', run)).toBeNull()
    expect(remoteWebBase('/repo/empty', run)).toBeNull()
  })
})

// contract check against the real simulation vault (same gate as atlas.test.ts):
// the derived base is that repo's REAL origin, normalized — the DoD evidence
describe.skipIf(!existsSync(NIMBUS_VAULT))('remoteWebBase (nimbus simulation vault)', () => {
  it('derives the vault repo base from its real origin remote via real git', () => {
    const base = remoteWebBase(NIMBUS_VAULT)
    expect(base).toMatch(/^https:\/\/github\.com\/[^/]+\/[^/]+$/)
    expect(base?.endsWith('.git')).toBe(false)
  })
})

// ── story 12.2 ───────────────────────────────────────────────────────────────

/** exec stub: map of "cmd arg0 arg1" prefixes → resolve/reject */
const execOk =
  (outputs: Record<string, string>): ExecRunner =>
  async (cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`
    for (const [prefix, out] of Object.entries(outputs)) {
      if (key.startsWith(prefix)) return out
    }
    throw new Error(`unexpected exec: ${key}`)
  }

const execFail = (failOn: string): ExecRunner => {
  return async (cmd, args) => {
    const key = `${cmd} ${args.join(' ')}`
    if (key.startsWith(failOn)) throw new Error(`exit 1: ${key}`)
    return ''
  }
}

describe('gh capability detection (AC1 matrix)', () => {
  it('no gh at all (ENOENT) → false', async () => {
    await expect(detectGh(execFail('gh --version'))).resolves.toBe(false)
  })

  it('gh installed but unauthenticated → false', async () => {
    await expect(detectGh(execFail('gh auth status'))).resolves.toBe(false)
  })

  it('gh installed and signed in → true', async () => {
    await expect(
      detectGh(execOk({ 'gh --version': 'gh version 2.87.3', 'gh auth status': 'ok' })),
    ).resolves.toBe(true)
  })

  it('capability defaults to false with no probe and no db — degrade, never guess', () => {
    expect(ghCapability(null)).toBe(false)
  })

  it('initGhCapability primes the session answer', async () => {
    await initGhCapability(null, execOk({ 'gh --version': 'x', 'gh auth status': 'x' }))
    expect(ghCapability(null)).toBe(true)
    await initGhCapability(null, execFail('gh --version'))
    expect(ghCapability(null)).toBe(false) // the settings re-check path
  })
})

const PR_MERGED: PrInfo = {
  url: 'https://github.com/acme/nimbus/pull/7',
  number: 7,
  title: 'feat: orders endpoint',
  state: 'MERGED',
  mergedAt: '2026-07-09T10:00:00Z',
}

describe('gh pr list parsing + command shape (AC2)', () => {
  it('prListArgs is the decided command shape, verbatim', () => {
    expect(prListArgs('acme/nimbus', 'abc1234')).toEqual([
      'pr',
      'list',
      '--repo',
      'acme/nimbus',
      '--search',
      'abc1234',
      '--state',
      'all',
      '--json',
      'number,title,state,mergedAt,url',
    ])
    expect(GH_TIMEOUT_MS).toBe(5_000)
  })

  it('parsePrList prefers the merged PR, else the first row', () => {
    const open = { url: 'https://x/pull/1', number: 1, title: 'a', state: 'OPEN', mergedAt: null }
    expect(parsePrList(JSON.stringify([open, PR_MERGED]))?.state).toBe('MERGED')
    expect(parsePrList(JSON.stringify([open]))?.number).toBe(1)
  })

  it('parsePrList degrades to null on empty / malformed / non-array output', () => {
    expect(parsePrList('[]')).toBeNull()
    expect(parsePrList('not json')).toBeNull()
    expect(parsePrList('{"data":1}')).toBeNull()
    expect(parsePrList(JSON.stringify([{ nope: true }]))).toBeNull()
  })
})

describe('prForCommit (capability gate, timeout fallback, per-sha cache)', () => {
  const gitRun = vi.fn(() => 'git@github.com:acme/nimbus.git')
  const SHA = 'a'.repeat(40)

  it('returns null without gh capability — no exec at all', async () => {
    const exec = vi.fn<ExecRunner>()
    expect(await prForCommit('/repo', SHA, { db: null, exec, run: gitRun })).toBeNull()
    expect(exec).not.toHaveBeenCalled()
  })

  it('looks up once per sha and serves the session cache after', async () => {
    await initGhCapability(null, execOk({ gh: 'ok' }))
    const exec = vi.fn<ExecRunner>(async () => JSON.stringify([PR_MERGED]))
    const first = await prForCommit('/repo', SHA, { db: null, exec, run: gitRun })
    const second = await prForCommit('/repo', SHA, { db: null, exec, run: gitRun })
    expect(first?.number).toBe(7)
    expect(second).toEqual(first)
    expect(exec).toHaveBeenCalledTimes(1)
    expect(exec).toHaveBeenCalledWith('gh', prListArgs('acme/nimbus', SHA), {
      timeoutMs: GH_TIMEOUT_MS,
      cwd: '/repo',
    })
  })

  it('gh timeout/error → null, cached (no retry storm)', async () => {
    await initGhCapability(null, execOk({ gh: 'ok' }))
    const exec = vi.fn<ExecRunner>(async () => {
      throw new Error('timed out')
    })
    expect(await prForCommit('/repo', SHA, { db: null, exec, run: gitRun })).toBeNull()
    expect(await prForCommit('/repo', SHA, { db: null, exec, run: gitRun })).toBeNull()
    expect(exec).toHaveBeenCalledTimes(1)
  })

  it('non-GitHub repo → null without invoking gh', async () => {
    await initGhCapability(null, execOk({ gh: 'ok' }))
    const exec = vi.fn<ExecRunner>()
    const run = vi.fn(() => 'git@gitlab.com:acme/nimbus.git')
    expect(await prForCommit('/gitlab-repo', SHA, { db: null, exec, run })).toBeNull()
    expect(exec).not.toHaveBeenCalled()
  })
})

// ── suggestion trigger matrix (AC3/AC5) ─────────────────────────────────────

const card = (id: string, status: string, to = 'backend'): HandoffCard =>
  ({
    id,
    name: id,
    from: 'frontend',
    to,
    objective: `do ${id}`,
    date: '2026-07-01',
    ageDays: 9,
    status,
    path: `/v/projects/${to}/handoffs/${id}.md`,
    readingOrder: [],
    kind: 'request',
    expired: false,
  }) as HandoffCard

const SHA = 'b'.repeat(40)
const mentioned = (handoffId: string) => [{ handoffId, confidence: 'mentioned' as const }]

function evaluate(over: Partial<Parameters<typeof evaluateSuggestions>[0]> = {}) {
  return evaluateSuggestions({
    changes: [{ sha: SHA, links: mentioned('h1'), pr: PR_MERGED }],
    cards: [card('h1', 'open')],
    myProjects: ['backend'],
    isDismissed: () => false,
    alreadySuggested: () => false,
    ...over,
  })
}

describe('evaluateSuggestions (tier × status × ownership × dismissed)', () => {
  it('merged PR × open handoff × my project → suggest consumed, with evidence', () => {
    expect(evaluate()).toEqual([
      {
        handoffId: 'h1',
        suggested: 'consumed',
        evidence: { sha: SHA, prUrl: PR_MERGED.url },
      },
    ])
  })

  it('merged PR × accepted handoff → consumed; mentioned-only × open → accepted', () => {
    expect(evaluate({ cards: [card('h1', 'accepted')] })[0]?.suggested).toBe('consumed')
    const noPr = evaluate({ changes: [{ sha: SHA, links: mentioned('h1'), pr: null }] })
    expect(noPr).toEqual([{ handoffId: 'h1', suggested: 'accepted', evidence: { sha: SHA } }])
  })

  it('mentioned-only × accepted → nothing to suggest (already accepted)', () => {
    expect(
      evaluate({
        changes: [{ sha: SHA, links: mentioned('h1'), pr: null }],
        cards: [card('h1', 'accepted')],
      }),
    ).toEqual([])
  })

  it('terminal/snoozed handoffs never fire (consumed, declined, snoozed)', () => {
    for (const status of ['consumed', 'declined', 'snoozed']) {
      expect(evaluate({ cards: [card('h1', status)] })).toEqual([])
    }
  })

  it('not my project → never fires; no registered projects → everything is mine', () => {
    expect(evaluate({ myProjects: ['mobile'] })).toEqual([])
    expect(evaluate({ myProjects: [] })).toHaveLength(1) // picker-vault rule (story 3.7)
  })

  it('dismissed and already-suggested never re-fire', () => {
    expect(evaluate({ isDismissed: () => true })).toEqual([])
    expect(evaluate({ alreadySuggested: () => true })).toEqual([])
    expect(dismissKey('h1', SHA)).toBe(`dismissed:h1:${SHA}`)
  })

  it('unknown handoff id and empty link lists are silent', () => {
    expect(evaluate({ cards: [] })).toEqual([])
    expect(evaluate({ changes: [{ sha: SHA, links: [], pr: PR_MERGED }] })).toEqual([])
  })
})

describe('suggestFromFreshChanges (the pipeline: emits events, writes NOTHING)', () => {
  const deps = (over: Partial<Parameters<typeof suggestFromFreshChanges>[0]> = {}) => {
    const emitted: unknown[] = []
    return {
      emitted,
      deps: {
        emit: (e: unknown) => emitted.push(e),
        cards: () => [card('h1', 'open')],
        myProjects: () => ['backend'],
        linksFor: (sha: string) => (sha === SHA ? mentioned('h1') : []),
        isDismissed: () => false,
        prFor: async () => PR_MERGED,
        ...over,
      } as Parameters<typeof suggestFromFreshChanges>[0],
    }
  }

  it('mentioned + merged PR → one suggest.statusChange; session dedupe on re-run', async () => {
    const { emitted, deps: d } = deps()
    await suggestFromFreshChanges(d, [{ repoRoot: '/repo', sha: SHA }])
    expect(emitted).toEqual([
      {
        kind: 'suggest.statusChange',
        handoffId: 'h1',
        suggested: 'consumed',
        evidence: { sha: SHA, prUrl: PR_MERGED.url },
      },
    ])
    await suggestFromFreshChanges(d, [{ repoRoot: '/repo', sha: SHA }])
    expect(emitted).toHaveLength(1) // fires once per session unless dismissed
  })

  it('heuristic-tier links cannot enter (story 11.3 guardrail, by filter)', async () => {
    const { emitted, deps: d } = deps({
      linksFor: () => [{ handoffId: 'h1', confidence: 'heuristic' as const }],
    })
    await suggestFromFreshChanges(d, [{ repoRoot: '/repo', sha: SHA }])
    expect(emitted).toEqual([])
  })

  it('no mentioned links → gh is never consulted (no PR lookup storm)', async () => {
    const prFor = vi.fn(async () => PR_MERGED)
    const { emitted, deps: d } = deps({ linksFor: () => [], prFor })
    await suggestFromFreshChanges(d, [{ repoRoot: '/repo', sha: SHA }])
    expect(prFor).not.toHaveBeenCalled()
    expect(emitted).toEqual([])
  })

  it('dismissed suggestions never re-fire across the pipeline', async () => {
    const { emitted, deps: d } = deps({ isDismissed: () => true })
    await suggestFromFreshChanges(d, [{ repoRoot: '/repo', sha: SHA }])
    expect(emitted).toEqual([])
  })
})

describe('no silent status writes — categorical (AC5)', () => {
  it('the github module never imports the engine, the write lock, or any lib writer', () => {
    const source = readFileSync(resolve(import.meta.dirname, 'github.ts'), 'utf8')
    expect(source).not.toMatch(/from '\.\/engine'/)
    expect(source).not.toMatch(/from '\.\/write-lock'/)
    expect(source).not.toMatch(/from 'loredex'/)
    expect(source).not.toMatch(/setHandoffStatus|consumeHandoff/)
  })

  it('the suggestion deps surface exposes read functions only (writes are impossible)', async () => {
    // every dep is a read or an event emit; the pipeline resolves without any
    // writer in scope — a write path would need a dep that does not exist
    const emitted: unknown[] = []
    await suggestFromFreshChanges(
      {
        emit: (e) => emitted.push(e),
        cards: () => [card('h1', 'open')],
        myProjects: () => [],
        linksFor: () => mentioned('h1'),
        isDismissed: () => false,
        prFor: async () => null,
      },
      [{ repoRoot: '/repo', sha: SHA }],
    )
    expect(emitted).toEqual([
      { kind: 'suggest.statusChange', handoffId: 'h1', suggested: 'accepted', evidence: { sha: SHA } },
    ])
  })
})
