/**
 * Story 13.1: create-vault wizard — ls-remote parsing, the step runner's
 * failure codes at each exact step, progress-event ordering, and the AC4
 * guarantee (every failure after scaffold leaves a valid LOCAL vault).
 */
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { type CoreEvent, type ErrEnvelope, isErrEnvelope } from '../shared/ipc-contract'
import type { Config, SyncHealth } from '../shared/types'
import {
  createVault,
  ensureEmptyDir,
  parseLsRemote,
  validateRemote,
  type WizardDeps,
} from './wizard'

const HEALTH = { state: 'ok' } as SyncHealth

interface Harness {
  deps: WizardDeps
  events: CoreEvent[]
  gitCalls: string[][]
  written: Config[]
  cursors: Array<{ vaultPath: string; remoteUrl: string | null; branch: string; sha: string }>
  scaffolded: string[]
}

function harness(overrides: Partial<WizardDeps> = {}): Harness {
  const events: CoreEvent[] = []
  const gitCalls: string[][] = []
  const written: Config[] = []
  const cursors: Harness['cursors'] = []
  const scaffolded: string[] = []
  const defaultGit = async (_cwd: string, args: readonly string[]): Promise<string> => {
    if (args[0] === 'ls-remote') return 'ref: refs/heads/main\tHEAD\n'
    if (args[0] === 'rev-parse') return 'abc123\n'
    return ''
  }
  const innerGit = overrides.git ?? defaultGit
  const deps: WizardDeps = {
    emit: (e) => events.push(e),
    identity: () => ({ name: 'Dana Reyes', email: 'dana@nimbus.dev' }),
    scaffold: (path) => {
      scaffolded.push(path)
      mkdirSync(join(path, 'projects'), { recursive: true })
    },
    readConfig: () => null,
    writeConfig: (config) => written.push(config),
    ensureMergeDriver: () => {},
    syncHealth: () => HEALTH,
    seedCursor: (vaultPath, remoteUrl, cursor) => cursors.push({ vaultPath, remoteUrl, ...cursor }),
    lock: (fn) => fn(),
    ...overrides,
    // every git call is recorded, whichever fake answers it
    git: async (cwd, args) => {
      gitCalls.push([...args])
      return innerGit(cwd, args)
    },
  }
  return { deps, events, gitCalls, written, cursors, scaffolded }
}

function freshDir(): string {
  return join(mkdtempSync(join(tmpdir(), 'loredex-wizard-')), 'vault')
}

function progress(events: CoreEvent[]): Array<[string, string]> {
  return events
    .filter((e): e is Extract<CoreEvent, { kind: 'wizard.progress' }> => e.kind === 'wizard.progress')
    .map((e) => [e.step, e.status])
}

async function envelopeOf(p: Promise<unknown>): Promise<ErrEnvelope> {
  try {
    await p
  } catch (e) {
    if (isErrEnvelope(e)) return e
    throw e
  }
  throw new Error('expected the wizard to reject')
}

// ── ls-remote parsing ────────────────────────────────────────────────────────

describe('parseLsRemote', () => {
  it('reads the HEAD symref and sees refs on a populated remote', () => {
    const out = [
      'ref: refs/heads/trunk\tHEAD',
      'a1b2c3\tHEAD',
      'a1b2c3\trefs/heads/trunk',
      'd4e5f6\trefs/heads/feature',
    ].join('\n')
    expect(parseLsRemote(out)).toEqual({ empty: false, defaultBranch: 'trunk' })
  })

  it('treats no refs as an empty remote (safe to push a new vault into)', () => {
    expect(parseLsRemote('')).toEqual({ empty: true, defaultBranch: null })
    // git ≥2.30 advertises the unborn HEAD symref for empty repos
    expect(parseLsRemote('ref: refs/heads/main\tHEAD\n')).toEqual({
      empty: true,
      defaultBranch: 'main',
    })
  })
})

describe('validateRemote', () => {
  it('maps a git failure to reachable:false with git’s words, never a throw', async () => {
    const { deps } = harness({
      git: async () => {
        throw new Error('fatal: could not read Username')
      },
    })
    expect(await validateRemote(deps, 'https://example.com/x.git')).toEqual({
      reachable: false,
      empty: false,
      defaultBranch: null,
      message: 'fatal: could not read Username',
    })
  })

  it('returns reachable + emptiness + default branch on success', async () => {
    const { deps } = harness()
    expect(await validateRemote(deps, 'git@github.com:t/v.git')).toEqual({
      reachable: true,
      empty: true,
      defaultBranch: 'main',
    })
  })
})

// ── destination rule ─────────────────────────────────────────────────────────

describe('ensureEmptyDir', () => {
  it('creates a nonexistent dir, accepts an empty one, ignores .DS_Store', () => {
    const dir = freshDir()
    ensureEmptyDir(dir) // nonexistent → created
    expect(existsSync(dir)).toBe(true)
    writeFileSync(join(dir, '.DS_Store'), '')
    ensureEmptyDir(dir) // Finder detritus is not content
  })

  it('throws DEST_NOT_EMPTY for a folder with real files', () => {
    const dir = freshDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'keep.txt'), 'x')
    try {
      ensureEmptyDir(dir)
      throw new Error('expected DEST_NOT_EMPTY')
    } catch (e) {
      expect(isErrEnvelope(e) && e.code).toBe('DEST_NOT_EMPTY')
    }
  })
})

// ── create sequence: failure codes at their exact steps ──────────────────────

describe('createVault failure mapping', () => {
  it('DEST_NOT_EMPTY fails the destination step before anything runs', async () => {
    const dir = freshDir()
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'file.md'), 'x')
    const h = harness()
    const err = await envelopeOf(createVault(h.deps, { dir }))
    expect(err.code).toBe('DEST_NOT_EMPTY')
    expect(progress(h.events)).toEqual([
      ['destination', 'running'],
      ['destination', 'failed'],
    ])
    expect(h.scaffolded).toEqual([]) // nothing written
  })

  it('REMOTE_UNREACHABLE at preflight — before any writes, no local vault', async () => {
    const h = harness({
      git: async () => {
        throw new Error('ssh: connect to host github.com port 22: timed out')
      },
    })
    const dir = freshDir()
    const err = await envelopeOf(createVault(h.deps, { dir, remoteUrl: 'git@github.com:t/v.git' }))
    expect(err.code).toBe('REMOTE_UNREACHABLE')
    expect(err.message).toContain('this app never asks for GitHub login')
    expect(err.detail).toMatchObject({ localVaultCreated: false })
    expect(h.scaffolded).toEqual([])
    expect(progress(h.events).at(-1)).toEqual(['preflight', 'failed'])
  })

  it('PUSH_REJECTED at preflight when the remote already has commits — offers join', async () => {
    const h = harness({
      git: async (_cwd, args) => {
        if (args[0] === 'ls-remote') return 'a1b2c3\trefs/heads/main\n'
        return ''
      },
    })
    const err = await envelopeOf(
      createVault(h.deps, { dir: freshDir(), remoteUrl: 'git@github.com:t/v.git' }),
    )
    expect(err.code).toBe('PUSH_REJECTED')
    expect(err.message).toContain('join it instead')
    expect(err.detail).toMatchObject({ localVaultCreated: false })
  })

  it('IDENTITY_MISSING blocks before scaffold', async () => {
    const h = harness({ identity: () => null })
    const err = await envelopeOf(createVault(h.deps, { dir: freshDir() }))
    expect(err.code).toBe('IDENTITY_MISSING')
    expect(h.scaffolded).toEqual([])
    expect(progress(h.events).at(-1)).toEqual(['identity', 'failed'])
  })

  it('push failure AFTER scaffold reports the intact local vault (AC4)', async () => {
    const h = harness({
      git: async (_cwd, args) => {
        if (args[0] === 'ls-remote') return '' // empty, reachable
        if (args[0] === 'push') throw new Error('fatal: Authentication failed')
        if (args[0] === 'rev-parse') return 'abc123\n'
        return ''
      },
    })
    const dir = freshDir()
    const err = await envelopeOf(createVault(h.deps, { dir, remoteUrl: 'https://x.test/v.git' }))
    expect(err.code).toBe('REMOTE_UNREACHABLE')
    expect(err.detail).toMatchObject({
      localVaultCreated: true,
      gitOutput: 'fatal: Authentication failed',
    })
    // the local vault WAS built: scaffold ran, config registered, git init ran
    expect(h.scaffolded).toEqual([dir])
    expect(h.written.at(-1)).toMatchObject({ vaultPath: dir, sync: 'git' })
    expect(h.gitCalls).toContainEqual(['init', '-b', 'main'])
    expect(progress(h.events).at(-1)).toEqual(['remote', 'failed'])
  })

  it('rejected push (remote gained commits mid-flight) maps to PUSH_REJECTED', async () => {
    const h = harness({
      git: async (_cwd, args) => {
        if (args[0] === 'ls-remote') return ''
        if (args[0] === 'push') throw new Error('! [rejected] main -> main (fetch first)')
        return ''
      },
    })
    const err = await envelopeOf(
      createVault(h.deps, { dir: freshDir(), remoteUrl: 'https://x.test/v.git' }),
    )
    expect(err.code).toBe('PUSH_REJECTED')
    expect(err.detail).toMatchObject({ localVaultCreated: true })
  })
})

// ── happy paths: step order, identity injection, cursor seed ─────────────────

describe('createVault sequences', () => {
  it('local-only: destination → identity → scaffold → seed; no git remote ops, no cursor', async () => {
    const h = harness()
    const dir = freshDir()
    const result = await createVault(h.deps, { dir })
    expect(result).toEqual({ vaultPath: dir, remoteWired: false })
    expect(progress(h.events)).toEqual([
      ['destination', 'running'],
      ['destination', 'done'],
      ['identity', 'running'],
      ['identity', 'done'],
      ['scaffold', 'running'],
      ['scaffold', 'done'],
      ['seed', 'running'],
      ['seed', 'done'],
    ])
    expect(h.gitCalls).toEqual([['init', '-b', 'main']])
    expect(h.cursors).toEqual([])
    expect(h.written).toEqual([{ projects: {}, vaultPath: dir, sync: 'git' }])
  })

  it('with remote: preflight first, identity on the commit, push -u, cursor seeded', async () => {
    const h = harness()
    const dir = freshDir()
    const result = await createVault(h.deps, { dir, remoteUrl: 'git@github.com:t/v.git' })
    expect(result).toEqual({ vaultPath: dir, remoteWired: true })
    expect(progress(h.events).map(([step]) => step)).toEqual([
      'destination',
      'destination',
      'preflight',
      'preflight',
      'identity',
      'identity',
      'scaffold',
      'scaffold',
      'remote',
      'remote',
      'seed',
      'seed',
    ])
    const commit = h.gitCalls.find((args) => args.includes('commit'))
    expect(commit).toEqual([
      '-c',
      'user.name=Dana Reyes',
      '-c',
      'user.email=dana@nimbus.dev',
      'commit',
      '-m',
      'loredex: scaffold vault',
    ])
    expect(h.gitCalls).toContainEqual(['push', '-u', 'origin', 'main'])
    expect(h.cursors).toEqual([
      { vaultPath: dir, remoteUrl: 'git@github.com:t/v.git', branch: 'main', sha: 'abc123' },
    ])
  })

  it('adopts the remote’s advertised default branch', async () => {
    const h = harness({
      git: async (_cwd, args) => {
        if (args[0] === 'ls-remote') return 'ref: refs/heads/trunk\tHEAD\n'
        if (args[0] === 'rev-parse') return 'abc123\n'
        return ''
      },
    })
    await createVault(h.deps, { dir: freshDir(), remoteUrl: 'https://x.test/v.git' })
    expect(h.gitCalls).toContainEqual(['init', '-b', 'trunk'])
    expect(h.gitCalls).toContainEqual(['push', '-u', 'origin', 'trunk'])
  })

  it('preserves the existing config file’s editor and projects map', async () => {
    const existing: Config = {
      vaultPath: '/old/vault',
      sync: 'none',
      editor: 'cursor',
      projects: { '/repo/api': { name: 'api' } },
    }
    const h = harness({ readConfig: () => existing })
    const dir = freshDir()
    await createVault(h.deps, { dir })
    expect(h.written.at(-1)).toEqual({
      vaultPath: dir,
      sync: 'git',
      editor: 'cursor',
      projects: { '/repo/api': { name: 'api' } },
    })
  })

  it('runs the whole mutating sequence inside the injected lock', async () => {
    let depth = 0
    let sawLocked = false
    const h = harness({
      lock: async (fn) => {
        depth += 1
        const out = await fn()
        depth -= 1
        return out
      },
      scaffold: () => {
        sawLocked = depth === 1
      },
    })
    await createVault(h.deps, { dir: freshDir() })
    expect(sawLocked).toBe(true)
  })
})
