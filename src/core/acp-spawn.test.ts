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

/** shared keys every adapter may emit (allowlist + ELECTRON_RUN_AS_NODE) */
const SHARED = new Set([
  'ELECTRON_RUN_AS_NODE',
  'HOME',
  'PATH',
  'USER',
  'LOGNAME',
  'SHELL',
  'TMPDIR',
  'LANG',
])
/** the ONLY provider credentials each agent may emit — a cross-provider key
 *  must NEVER appear (least privilege). */
const PROVIDER_ALLOWED = {
  claude: new Set(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_EXECUTABLE']),
  codex: new Set(['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_PATH']),
} as const

describe('adapterEnv (explicit, per-agent allowlist)', () => {
  it('emits ONLY shared + own-provider keys — seeded secrets never leak into the child', () => {
    vi.stubEnv('SECRET_X', 'y')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'z')
    vi.stubEnv('NPM_TOKEN', 't')
    for (const agent of ['claude', 'codex'] as const) {
      const env = adapterEnv(agent)
      expect(env.SECRET_X).toBeUndefined()
      expect(env.AWS_SECRET_ACCESS_KEY).toBeUndefined()
      expect(env.NPM_TOKEN).toBeUndefined()
      for (const key of Object.keys(env)) {
        expect(
          SHARED.has(key) || PROVIDER_ALLOWED[agent].has(key),
          `unexpected env key for ${agent}: ${key}`,
        ).toBe(true)
      }
    }
  })

  it('always sets ELECTRON_RUN_AS_NODE=1 (the Electron binary runs as plain node)', () => {
    expect(adapterEnv('claude').ELECTRON_RUN_AS_NODE).toBe('1')
  })

  it('API keys pass through ONLY when already set in our own env', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-test')
    expect(adapterEnv('claude').ANTHROPIC_API_KEY).toBe('sk-test')
    vi.stubEnv('ANTHROPIC_API_KEY', undefined)
    expect('ANTHROPIC_API_KEY' in adapterEnv('claude')).toBe(false)
  })

  it('never hands one vendor the OTHER vendor’s credentials (cross-provider least privilege)', () => {
    // a user who runs both Claude and Codex exports every key at once
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic')
    vi.stubEnv('CLAUDE_CODE_EXECUTABLE', '/bin/claude')
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai')
    vi.stubEnv('CODEX_API_KEY', 'sk-codex')
    vi.stubEnv('CODEX_PATH', '/bin/codex')
    const claude = adapterEnv('claude')
    expect(claude.ANTHROPIC_API_KEY).toBe('sk-anthropic')
    expect(claude.CLAUDE_CODE_EXECUTABLE).toBe('/bin/claude')
    expect('OPENAI_API_KEY' in claude).toBe(false)
    expect('CODEX_API_KEY' in claude).toBe(false)
    expect('CODEX_PATH' in claude).toBe(false)
    const codex = adapterEnv('codex')
    expect(codex.OPENAI_API_KEY).toBe('sk-openai')
    expect(codex.CODEX_API_KEY).toBe('sk-codex')
    expect(codex.CODEX_PATH).toBe('/bin/codex')
    expect('ANTHROPIC_API_KEY' in codex).toBe(false)
    expect('CLAUDE_CODE_EXECUTABLE' in codex).toBe(false)
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
