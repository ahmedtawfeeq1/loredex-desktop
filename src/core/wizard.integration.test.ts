/**
 * Stories 13.1/13.2 integration: the wizard sequences against a REAL scratch
 * bare remote — real git, the real loredex lib (scaffold/config/merge driver)
 * with LOREDEX_CONFIG_DIR pointed at a scratch dir. Create must produce a
 * vault a second "machine" can join (M2 DoD).
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { CoreEvent } from '../shared/ipc-contract'
import * as engine from './engine'
import { gitAsync, gitCloneStreaming, NON_INTERACTIVE_GIT_ENV } from './git'
import { createVault, joinVault, type WizardDeps } from './wizard'

const TIMEOUT = 30_000

let base: string
let remote: string
let savedConfigDir: string | undefined

interface Recorded {
  deps: WizardDeps
  events: CoreEvent[]
  cursors: Array<{ vaultPath: string; remoteUrl: string | null; branch: string; sha: string }>
}

function realDeps(): Recorded {
  const events: CoreEvent[] = []
  const cursors: Recorded['cursors'] = []
  const deps: WizardDeps = {
    emit: (e) => events.push(e),
    git: (cwd, args) => gitAsync(cwd, args, { env: NON_INTERACTIVE_GIT_ENV }),
    clone: gitCloneStreaming,
    schemaStatus: (path) => engine.schemaStatusAt(path),
    identity: () => ({ name: 'Dana Reyes', email: 'dana@nimbus.dev' }),
    scaffold: (path) => engine.scaffoldNewVault(path),
    readConfig: () => engine.readConfigFile(),
    writeConfig: (config) => engine.writeConfigFile(config),
    ensureMergeDriver: (path) => engine.ensureMergeDriverAt(path),
    syncHealth: (path) => engine.syncHealthAt(path),
    seedCursor: (vaultPath, remoteUrl, cursor) => cursors.push({ vaultPath, remoteUrl, ...cursor }),
    lock: (fn) => fn(),
  }
  return { deps, events, cursors }
}

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'loredex-wizard-int-'))
  remote = join(base, 'remote.git')
  execFileSync('git', ['init', '--bare', '-b', 'main', remote], { stdio: 'ignore' })
  savedConfigDir = process.env.LOREDEX_CONFIG_DIR
  process.env.LOREDEX_CONFIG_DIR = join(base, 'loredex-config')
})

afterAll(() => {
  if (savedConfigDir === undefined) delete process.env.LOREDEX_CONFIG_DIR
  else process.env.LOREDEX_CONFIG_DIR = savedConfigDir
})

describe('create-vault wizard against a real bare remote', () => {
  it(
    'scaffolds, registers config, pushes, and seeds the cursor at origin HEAD',
    async () => {
      const { deps, cursors } = realDeps()
      const dir = join(base, 'machine1', 'vault')
      const result = await createVault(deps, { dir, remoteUrl: remote })
      expect(result).toEqual({ vaultPath: dir, remoteWired: true })

      // vault tree scaffolded (lib truth)
      for (const p of ['projects', '_inbox', '_index/Home.md', '.loredex/engine.json']) {
        expect(existsSync(join(dir, p)), p).toBe(true)
      }
      // loredex config registered for CLI/agents on this machine
      const config = JSON.parse(
        readFileSync(join(base, 'loredex-config', 'config.json'), 'utf8'),
      ) as { vaultPath: string; sync: string }
      expect(config).toMatchObject({ vaultPath: dir, sync: 'git' })
      // the remote received the scaffold commit on main
      const refs = await gitAsync(base, ['ls-remote', remote, 'refs/heads/*'])
      expect(refs).toContain('refs/heads/main')
      // merge driver wired repo-locally (F8 pattern)
      const attributes = readFileSync(join(dir, '.git', 'info', 'attributes'), 'utf8')
      expect(attributes).toContain('_index/** merge=loredex-generated')
      // fresh cursor seeded AT the pushed sha — first poll emits nothing
      const sha = (await gitAsync(dir, ['rev-parse', 'HEAD'])).trim()
      expect(cursors).toEqual([{ vaultPath: dir, remoteUrl: remote, branch: 'main', sha }])
      // attributed commit, injected per command (F7)
      const author = await gitAsync(dir, ['log', '-1', '--format=%an <%ae>'])
      expect(author.trim()).toBe('Dana Reyes <dana@nimbus.dev>')
    },
    TIMEOUT,
  )
})

describe('join-vault wizard against the created remote (second machine)', () => {
  it(
    'clones, validates shape, registers, seeds the cursor at origin — board-ready',
    async () => {
      const { deps, events, cursors } = realDeps()
      const dest = join(base, 'machine2', 'vault')
      const result = await joinVault(deps, { url: remote, dest })
      expect(result).toEqual({ vaultPath: dest, schemaOk: true })

      // the clone IS the created vault (fresh scaffold's projects/ is empty →
      // untracked by git; shape validation passes via .loredex/engine.json —
      // exactly the m2 §7 "projects/ OR engine.json" rule)
      for (const p of ['_index/Home.md', '.loredex/engine.json']) {
        expect(existsSync(join(dest, p)), p).toBe(true)
      }
      // config re-registered onto the joined vault (machine2's engines see it)
      const config = JSON.parse(
        readFileSync(join(base, 'loredex-config', 'config.json'), 'utf8'),
      ) as { vaultPath: string }
      expect(config.vaultPath).toBe(dest)
      // merge driver wired in the clone
      expect(readFileSync(join(dest, '.git', 'info', 'attributes'), 'utf8')).toContain(
        '_index/** merge=loredex-generated',
      )
      // fresh cursor at origin/main — the first poll emits NOTHING (no storm)
      const sha = (await gitAsync(dest, ['rev-parse', 'origin/main'])).trim()
      expect(cursors).toEqual([{ vaultPath: dest, remoteUrl: remote, branch: 'main', sha }])
      // no handoff events were emitted by the join — only wizard.progress
      expect(events.every((e) => e.kind === 'wizard.progress')).toBe(true)
      // clone progress actually streamed
      expect(
        events.some((e) => e.kind === 'wizard.progress' && e.step === 'clone' && e.detail),
      ).toBe(true)
    },
    TIMEOUT,
  )

  it(
    'NOT_A_VAULT keeps the clone on disk and never registers it',
    async () => {
      // a real repo that is NOT a vault
      const plain = join(base, 'plain')
      execFileSync('git', ['init', '-b', 'main', plain], { stdio: 'ignore' })
      execFileSync('git', ['-C', plain, '-c', 'user.name=x', '-c', 'user.email=x@y.z', 'commit', '--allow-empty', '-m', 'init'], { stdio: 'ignore' })
      const before = readFileSync(join(base, 'loredex-config', 'config.json'), 'utf8')

      const { deps } = realDeps()
      const dest = join(base, 'machine3', 'clone')
      await expect(joinVault(deps, { url: plain, dest })).rejects.toMatchObject({
        code: 'NOT_A_VAULT',
      })
      expect(existsSync(join(dest, '.git'))).toBe(true) // the download was kept
      // config untouched — register never ran
      expect(readFileSync(join(base, 'loredex-config', 'config.json'), 'utf8')).toBe(before)
    },
    TIMEOUT,
  )
})
