/**
 * Story 12.1: per-repo web-base derivation — real `git remote get-url origin`
 * output through the one shared normalization, cached per repo per session
 * (including the no-remote failure, so degraded repos never retry-storm).
 */
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { clearGithubCaches, originRemote, remoteWebBase } from './github'

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
