/**
 * Final branch review finding (2026-07-29), BLOCKING: `engine.setGenudoBaseUrl`
 * used to write the rewritten workspace.yml to disk BEFORE
 * `materializeWorkspace` had a chance to validate it. A scheme-less host —
 * "staging.genudo.ai", the natural thing for a user to type — passes both
 * `normalizeGenudoUrl` and `setGenudoUrl`'s text-level rewrite, but fails
 * loredex's own `remoteServerSchema` (`z.string().url()`) once
 * `materializeWorkspace` re-parses the file this function just wrote. By then
 * the invalid file was already on disk with no commit to explain it, and
 * `gitAutoCommit` never ran — so `clientConnections` throws for that client
 * on every subsequent call, and the ONLY recovery was hand-editing a dex
 * file, which this project's automation-first rule forbids.
 *
 * This pins the fix: a rejected value must leave workspace.yml BYTE-IDENTICAL
 * to what it was before the call, with an actionable error surfaced instead.
 * Self-contained tmp git vault (pattern: genudo-signin-handler.test.ts) — a
 * real git repo is required because the happy-path branch of
 * setGenudoBaseUrl ends in gitAutoCommit.
 */
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, realpathSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scaffoldClient, scaffoldVault } from 'loredex'
import { beforeAll, describe, expect, it } from 'vitest'
import { initEngine, setGenudoBaseUrl } from './engine'

let vault: string
let wsPath: string
const identity = { name: 'Test Runner', email: 'test@example.dev' }

function git(...args: string[]): string {
  return execFileSync('git', args, { cwd: vault, encoding: 'utf8' })
}

beforeAll(() => {
  const sandbox = realpathSync(mkdtempSync(join(tmpdir(), 'loredex-genudo-seturl-')))
  vault = join(sandbox, 'vault')
  scaffoldVault(vault, 'agent-ops')
  scaffoldClient(vault, 'acme_dental')
  wsPath = join(vault, 'projects', 'acme-dental', 'workspace.yml')
  writeFileSync(
    wsPath,
    `# Agent tooling for this client — committed, secret-free.
mcp:
  genudo:
    type: http
    url: https://api.genudo.ai/mcp
    headers:
      Authorization: "Bearer \${GENUDO_TOKEN_ACME}"
plugins:
  claude: [genudo-no-connector@genudo-ai]
skills: []
`,
  )
  git('init', '-b', 'main')
  git('add', '-A')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@acme.dev', 'commit', '-m', 'seed')

  const configDir = mkdtempSync(join(tmpdir(), 'loredex-genudo-seturl-config-'))
  writeFileSync(
    join(configDir, 'config.json'),
    JSON.stringify({ vaultPath: vault, sync: 'git', projects: {} }),
  )
  process.env.LOREDEX_CONFIG_DIR = configDir
  initEngine()
})

describe('engine.setGenudoBaseUrl — rollback when materialize rejects the new value', () => {
  it('throws AND leaves workspace.yml byte-identical for a scheme-less host', () => {
    const before = readFileSync(wsPath, 'utf8')
    expect(() => setGenudoBaseUrl('acme-dental', 'staging.genudo.ai', identity)).toThrow()
    const after = readFileSync(wsPath, 'utf8')
    expect(after).toBe(before)
  })

  it('the thrown error is actionable, not a bare internal stack trace', () => {
    expect.assertions(1)
    try {
      setGenudoBaseUrl('acme-dental', 'another-schemeless-host.example', identity)
    } catch (e) {
      expect(String((e as Error).message ?? e)).toMatch(/genudo environment/i)
    }
  })

  it('a VALID url still applies normally — the rollback path does not break the happy path', () => {
    // materialize's `ok` also folds in unrelated missing ${VAR} env refs
    // (GENUDO_TOKEN_ACME isn't seeded in this test) — a url change alone
    // does not make it `true`, so assert on the write, not `ok`.
    const result = setGenudoBaseUrl('acme-dental', 'https://genudo.acme.internal', identity)
    expect(result.wouldChange).toEqual([])
    expect(readFileSync(wsPath, 'utf8')).toContain('url: https://genudo.acme.internal/mcp')
    // and it really did commit — the whole point of writing after (not
    // before) the file is byte-clean on disk
    expect(git('log', '-1', '--format=%s')).toContain('genudo base url for acme-dental')
  })
})
