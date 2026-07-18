/**
 * ACP adapter spawn plumbing (acp blueprint 2026-07-18, step 4.1). The env
 * allowlist is a SECURITY law — an adapter child must see ONLY the listed
 * keys (the opposite of the pty's full inherit): stdout is the protocol wire,
 * stderr may carry tokens, and the parent env may carry anything. The ring
 * bounds what an error path may ever surface.
 */
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { adapterEntry, adapterEnv, StderrRing } from './acp-spawn'

afterEach(() => vi.unstubAllEnvs())

/** the ONLY keys adapterEnv may ever emit (allowlist + conditional API keys) */
const ALLOWED = new Set([
  'ELECTRON_RUN_AS_NODE',
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
  'ANTHROPIC_API_KEY',
  'CLAUDE_CODE_EXECUTABLE',
  'CODEX_API_KEY',
  'OPENAI_API_KEY',
  'CODEX_PATH',
])

describe('adapterEnv (explicit allowlist)', () => {
  it('emits ONLY allowlisted keys — seeded secrets never leak into the child', () => {
    vi.stubEnv('SECRET_X', 'y')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'z')
    vi.stubEnv('NPM_TOKEN', 't')
    const env = adapterEnv()
    expect(env.SECRET_X).toBeUndefined()
    expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
    expect(env.NPM_TOKEN).toBeUndefined()
    for (const key of Object.keys(env)) {
      expect(ALLOWED.has(key), `unexpected env key: ${key}`).toBe(true)
    }
  })

  it('always sets ELECTRON_RUN_AS_NODE=1 (the Electron binary runs as plain node)', () => {
    expect(adapterEnv().ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('API keys pass through ONLY when already set in our own env', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    expect(adapterEnv().ANTHROPIC_API_KEY).toBe('sk-test')
    vi.stubEnv('ANTHROPIC_API_KEY', undefined)
    expect('ANTHROPIC_API_KEY' in adapterEnv()).toBe(false)
  })
})

describe('StderrRing (bounded — never wholesale)', () => {
  it('tail() returns the last 4 NON-empty lines, joined', () => {
    const ring = new StderrRing()
    ring.push('one\n\ntwo\n')
    ring.push(Buffer.from('three\n\nfour\nfive\n'))
    expect(ring.tail()).toBe('two\nthree\nfour\nfive')
  })

  it('enforces the byte cap — old content falls off the front', () => {
    const ring = new StderrRing(16)
    ring.push('a'.repeat(20) + '\nEND')
    const tail = ring.tail()
    expect(tail.length).toBeLessThanOrEqual(16)
    expect(tail.endsWith('END')).toBe(true) // newest bytes survive
  })

  it('default cap bounds a 5 KB single-line blast to 4096', () => {
    const ring = new StderrRing()
    ring.push('x'.repeat(5000))
    expect(ring.tail().length).toBeLessThanOrEqual(4096)
  })

  it('is empty-safe (no adapter output yet)', () => {
    expect(new StderrRing().tail()).toBe('')
  })
})

describe('adapterEntry (pinned dependency on disk — never npx/PATH)', () => {
  it('resolves an existing dist/index.js for both adapters (a miss is a real defect)', () => {
    for (const agent of ['claude', 'codex'] as const) {
      const entry = adapterEntry(agent)
      expect(entry.endsWith(join('dist', 'index.js')), entry).toBe(true)
      expect(existsSync(entry), `missing adapter entry: ${entry}`).toBe(true)
    }
  })
})
