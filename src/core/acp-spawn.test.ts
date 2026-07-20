/**
 * ACP adapter spawn plumbing (acp blueprint 2026-07-18, step 4.1). The env
 * allowlist is a SECURITY law — an adapter child must see ONLY the listed
 * keys (the opposite of the pty's full inherit): stdout is the protocol wire,
 * stderr may carry tokens, and the parent env may carry anything. The ring
 * bounds what an error path may ever surface.
 */
import * as childProcess from 'node:child_process'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  adapterEntry,
  adapterEnv,
  authMode,
  sharedEnvKeys,
  spawnAdapter,
  spawnErrorDetail,
  StderrRing,
} from './acp-spawn'

// ESM module namespaces aren't spy-able (non-configurable exports); mock the
// one function spawnAdapter dispatches to, preserving everything else so
// adapterEntry's real require.resolve still works.
vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>()
  return { ...actual, spawn: vi.fn() }
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.clearAllMocks()
})

/** shared keys every adapter may emit (this platform's allowlist +
 *  ELECTRON_RUN_AS_NODE) — BL-24 made the set platform-dependent. */
const SHARED = new Set(['ELECTRON_RUN_AS_NODE', ...sharedEnvKeys()])
/** the ONLY provider credentials each agent may emit — a cross-provider key
 *  must NEVER appear (least privilege). */
const PROVIDER_ALLOWED = {
  claude: new Set(['ANTHROPIC_API_KEY', 'CLAUDE_CODE_EXECUTABLE']),
  codex: new Set(['OPENAI_API_KEY', 'CODEX_API_KEY', 'CODEX_PATH']),
  gemini: new Set(['GEMINI_API_KEY', 'GOOGLE_API_KEY']),
} as const

describe('adapterEnv (explicit, per-agent allowlist)', () => {
  it('emits ONLY shared + own-provider keys — seeded secrets never leak into the child', () => {
    vi.stubEnv('SECRET_X', 'y')
    vi.stubEnv('AWS_SECRET_ACCESS_KEY', 'z')
    vi.stubEnv('NPM_TOKEN', 't')
    for (const agent of ['claude', 'codex', 'gemini'] as const) {
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

  /**
   * BL-24: the POSIX-only allowlist meant a Windows adapter received no
   * USERPROFILE (so no ~\.claude credentials) and — the reported symptom — no
   * PATHEXT/ComSpec/APPDATA, so an `npx`-based MCP server out of a client's
   * .mcp.json could not be spawned at all. Per-client MCP worked on macOS and
   * silently did not on Windows.
   */
  it('BL-24: the Windows set carries the credential root and the keys npx needs', () => {
    const win = sharedEnvKeys('win32')
    for (const key of ['USERPROFILE', 'PATH', 'PATHEXT', 'ComSpec', 'SystemRoot', 'APPDATA']) {
      expect(win, `windows adapters need ${key}`).toContain(key)
    }
    // and the POSIX names, which simply do not exist on Windows, are not it
    expect(win).not.toContain('HOME')
    expect(win).not.toContain('TMPDIR')
    expect(win).not.toContain('SHELL')
  })

  it('BL-24: the POSIX set is unchanged — macOS/Linux behaviour is untouched', () => {
    expect([...sharedEnvKeys('darwin')]).toEqual([
      'HOME',
      'PATH',
      'USER',
      'LOGNAME',
      'SHELL',
      'TMPDIR',
      'LANG',
    ])
    expect([...sharedEnvKeys('linux')]).toEqual([...sharedEnvKeys('darwin')])
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

  it('gemini gets ONLY its own GEMINI/GOOGLE keys — never the other vendors’', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-anthropic')
    vi.stubEnv('OPENAI_API_KEY', 'sk-openai')
    vi.stubEnv('GEMINI_API_KEY', 'sk-gemini')
    vi.stubEnv('GOOGLE_API_KEY', 'sk-google')
    const gemini = adapterEnv('gemini')
    expect(gemini.GEMINI_API_KEY).toBe('sk-gemini')
    expect(gemini.GOOGLE_API_KEY).toBe('sk-google')
    expect('ANTHROPIC_API_KEY' in gemini).toBe(false)
    expect('OPENAI_API_KEY' in gemini).toBe(false)
  })

  it('B1: a keychain overlay reaches ONLY the matching agent and wins over ambient', () => {
    // one overlay carries every provider's stored key; each adapter sees only its own
    const overlay = {
      ANTHROPIC_API_KEY: 'sk-stored-anthropic',
      OPENAI_API_KEY: 'sk-stored-openai',
    }
    vi.stubEnv('ANTHROPIC_API_KEY', undefined) // no ambient claude key
    const claude = adapterEnv('claude', overlay)
    expect(claude.ANTHROPIC_API_KEY).toBe('sk-stored-anthropic') // stored key folds in
    expect('OPENAI_API_KEY' in claude).toBe(false) // codex's stored key never leaks to claude
    // an explicit Settings key wins over an ambient one for the same var
    vi.stubEnv('ANTHROPIC_API_KEY', 'sk-ambient')
    expect(adapterEnv('claude', overlay).ANTHROPIC_API_KEY).toBe('sk-stored-anthropic')
  })
})

describe('authMode (subscription vs API — usage-meter tag)', () => {
  it('no billing key anywhere ⇒ subscription; an overlay key ⇒ api', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', undefined)
    expect(authMode('claude')).toBe('subscription')
    expect(authMode('claude', { ANTHROPIC_API_KEY: 'sk-stored' })).toBe('api')
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

describe('spawnAdapter (descriptor-driven — node-module vs user-binary)', () => {
  it('spawns gemini as the user binary on PATH with --experimental-acp + its env allowlist', () => {
    vi.stubEnv('GEMINI_API_KEY', 'sk-gemini')
    const spawnMock = vi.mocked(childProcess.spawn).mockReturnValue({} as never)
    spawnAdapter('gemini', '/vault/root')
    expect(spawnMock).toHaveBeenCalledTimes(1)
    const [cmd, args, opts] = spawnMock.mock.calls[0]
    expect(cmd).toBe('gemini') // the CLI name off PATH, NOT process.execPath
    expect(args).toEqual(['--experimental-acp'])
    expect(opts).toMatchObject({ cwd: '/vault/root', stdio: ['pipe', 'pipe', 'pipe'] })
    // the child inherits gemini's own allowlist (never a Claude/Codex key)
    const env = (opts as { env: NodeJS.ProcessEnv }).env
    expect(env.GEMINI_API_KEY).toBe('sk-gemini')
    expect('ANTHROPIC_API_KEY' in env).toBe(false)
  })

  it('spawns a node-module adapter (claude) under process.execPath, not a PATH binary', () => {
    const spawnMock = vi.mocked(childProcess.spawn).mockReturnValue({} as never)
    spawnAdapter('claude', '/vault/root')
    const [cmd, args] = spawnMock.mock.calls[0]
    expect(cmd).toBe(process.execPath)
    expect((args as string[])[0].endsWith(join('dist', 'index.js'))).toBe(true)
  })
})

describe('spawnErrorDetail (missing user binary → clean install hint, never a crash)', () => {
  it('maps a gemini ENOENT to an actionable install message', () => {
    const err = Object.assign(new Error('spawn gemini ENOENT'), { code: 'ENOENT' })
    expect(spawnErrorDetail('gemini', err)).toBe(
      'gemini CLI not found — install @google/gemini-cli',
    )
  })

  it('does NOT rewrite ENOENT for a node-module adapter (only user binaries get the hint)', () => {
    const err = Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' })
    expect(spawnErrorDetail('claude', err)).toBe('spawn ENOENT')
  })

  it('falls back to the first error line for a non-ENOENT gemini failure', () => {
    const err = Object.assign(new Error('EACCES: permission denied\nstack…'), { code: 'EACCES' })
    expect(spawnErrorDetail('gemini', err)).toBe('EACCES: permission denied')
  })
})
