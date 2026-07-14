/**
 * Wizard sequences (stories 13.1/13.2 — architecture-m2.md §7 verbatim,
 * paste-URL only, NO OAuth). Each flow is a core-host step runner: steps
 * emit wizard.progress events in order, failures map to typed envelope
 * codes, and every git mutation runs under the write lock with per-command
 * identity injection (F7). Dependencies are injected (poller pattern) so
 * unit tests drive each failure at its exact step.
 */
import { existsSync, mkdirSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { type CoreEvent, type ErrEnvelope, type IpcCode, ipcError } from '../shared/ipc-contract'
import type {
  Config,
  CreateVaultResult,
  Identity,
  JoinVaultResult,
  RemoteCheck,
  SyncHealth,
  WizardFlow,
  WizardStepStatus,
} from '../shared/types'
import { gitIdentityArgs } from './git'

/** The decided no-OAuth credentials message (m2 §7, verbatim mandate). */
export const NO_OAUTH_MESSAGE =
  'check the URL or your git credentials (SSH key / credential helper); this app never asks for GitHub login'

export interface WizardDeps {
  emit(event: CoreEvent): void
  /** async git runner — MUST be non-interactive (NON_INTERACTIVE_GIT_ENV) */
  git(cwd: string, args: readonly string[]): Promise<string>
  /** streaming `git clone --progress` (story 13.2); rejects with stderr tail */
  clone(
    url: string,
    dest: string,
    branch: string | undefined,
    onProgress: (line: string) => void,
  ): Promise<void>
  identity(): Identity | null
  scaffold(path: string, dexType?: 'research' | 'agent-ops'): void
  readConfig(): Config | null
  writeConfig(config: Config): void
  ensureMergeDriver(vaultPath: string): void
  syncHealth(vaultPath: string): SyncHealth
  /** lib vaultSchemaStatus at an explicit path (join handshake, story 13.2) */
  schemaStatus(vaultPath: string): { declared: number | null; supported: number; ok: boolean }
  /** seed poll_cursor so the first poll emits nothing (m2 §4 no-storm rule) */
  seedCursor(
    vaultPath: string,
    remoteUrl: string | null,
    cursor: { branch: string; sha: string },
  ): void
  /** THE core-host write lock (withWriteLock) — every mutating flow runs inside */
  lock<T>(fn: () => Promise<T>): Promise<T>
}

// ── step runner ──────────────────────────────────────────────────────────────

/** Emits wizard.progress per step: running → done, unless the step body posted
 *  its own terminal status (warn/done-with-detail); a throw posts failed. */
class StepRunner {
  private settled = false

  constructor(
    private readonly flow: WizardFlow,
    private readonly emitEvent: (e: CoreEvent) => void,
  ) {}

  post(step: string, status: WizardStepStatus, detail?: string): void {
    if (status !== 'running') this.settled = true
    this.emitEvent({
      kind: 'wizard.progress',
      flow: this.flow,
      step,
      status,
      ...(detail !== undefined ? { detail } : {}),
    })
  }

  async run<T>(step: string, fn: (post: (status: WizardStepStatus, detail?: string) => void) => T | Promise<T>): Promise<T> {
    this.settled = false
    this.post(step, 'running')
    try {
      const out = await fn((status, detail) => this.post(step, status, detail))
      if (!this.settled) this.post(step, 'done')
      return out
    } catch (e) {
      const message = isEnvelope(e) ? e.message : e instanceof Error ? e.message : String(e)
      this.post(step, 'failed', message)
      throw e
    }
  }
}

function isEnvelope(e: unknown): e is ErrEnvelope {
  return typeof e === 'object' && e !== null && typeof (e as ErrEnvelope).code === 'string'
}

function fail(
  code: IpcCode,
  message: string,
  detail: { localVaultCreated: boolean; gitOutput?: string },
): never {
  throw ipcError(code, message, detail)
}

/** Destination rule (both flows): the folder is empty or nonexistent. Finder
 *  detritus (.DS_Store) doesn't count as content. */
export function ensureEmptyDir(dir: string): void {
  if (existsSync(dir)) {
    const entries = readdirSync(dir).filter((name) => name !== '.DS_Store')
    if (entries.length > 0) {
      fail(
        'DEST_NOT_EMPTY',
        'that folder already has files in it — pick an empty or brand-new folder',
        { localVaultCreated: false },
      )
    }
  } else {
    mkdirSync(dir, { recursive: true })
  }
}

// ── remote preflight (wizard.validateRemote — read-only, no lock) ────────────

/** Parse `git ls-remote --symref <url>` output. No refs = empty remote. */
export function parseLsRemote(output: string): { empty: boolean; defaultBranch: string | null } {
  let defaultBranch: string | null = null
  let refs = 0
  for (const line of output.split('\n')) {
    const symref = /^ref:\s+refs\/heads\/(\S+)\s+HEAD$/.exec(line.trim())
    if (symref) defaultBranch = symref[1] ?? null
    else if (/\trefs\//.test(line) || /\tHEAD$/.test(line)) refs += 1
  }
  return { empty: refs === 0, defaultBranch }
}

/**
 * `git ls-remote` preflight — the whole point is running BEFORE any writes
 * (story 13.1 dev note). Unreachable/unauthorized comes back as a result, not
 * a throw, so the modal renders inline retry with git's own words behind it.
 */
export async function validateRemote(deps: WizardDeps, url: string): Promise<RemoteCheck> {
  try {
    const out = await deps.git(tmpdir(), ['ls-remote', '--symref', url, 'HEAD', 'refs/heads/*'])
    return { reachable: true, ...parseLsRemote(out) }
  } catch (e) {
    return {
      reachable: false,
      empty: false,
      defaultBranch: null,
      message: e instanceof Error ? e.message : String(e),
    }
  }
}

// ── create-vault sequence (story 13.1, m2 §7 steps verbatim) ─────────────────

export async function createVault(
  deps: WizardDeps,
  input: { dir: string; remoteUrl?: string; dexType?: 'research' | 'agent-ops' },
): Promise<CreateVaultResult> {
  const { dir, remoteUrl, dexType } = input
  const steps = new StepRunner('create', deps.emit)
  return deps.lock(async () => {
    // 1 — destination must be empty or nonexistent (native pick happened renderer-side)
    await steps.run('destination', () => ensureEmptyDir(dir))

    // 2 — optional remote: preflight BEFORE any writes
    let branch = 'main'
    if (remoteUrl) {
      await steps.run('preflight', async (post) => {
        const check = await validateRemote(deps, remoteUrl)
        if (!check.reachable) {
          fail('REMOTE_UNREACHABLE', `could not reach that remote — ${NO_OAUTH_MESSAGE}`, {
            localVaultCreated: false,
            ...(check.message ? { gitOutput: check.message } : {}),
          })
        }
        if (!check.empty) {
          fail(
            'PUSH_REJECTED',
            'that remote already has commits — join it instead of creating a new vault over it',
            { localVaultCreated: false },
          )
        }
        branch = check.defaultBranch ?? 'main'
        post('done', `remote reachable and empty — branch ${branch}`)
      })
    }

    // 3 — identity confirm (block if unset; every vault write is attributed)
    const identity = await steps.run('identity', (post) => {
      const id = deps.identity()
      if (!id) {
        fail(
          'IDENTITY_MISSING',
          'set your name and email first — every vault write is attributed',
          { localVaultCreated: false },
        )
      }
      post('done', `${id.name} <${id.email}>`)
      return id
    })

    // 4 — scaffold + config + git init: from here the LOCAL vault is valid
    await steps.run('scaffold', async () => {
      deps.scaffold(dir, dexType ?? 'research')
      deps.writeConfig({
        ...(deps.readConfig() ?? { projects: {} }),
        vaultPath: dir,
        sync: 'git',
      })
      await deps.git(dir, ['init', '-b', branch])
    })

    // 5 — remote wiring; any failure here leaves the valid local vault (AC4)
    if (remoteUrl) {
      await steps.run('remote', async () => {
        try {
          await deps.git(dir, ['remote', 'add', 'origin', remoteUrl])
          deps.ensureMergeDriver(dir)
          await deps.git(dir, ['add', '-A'])
          await deps.git(dir, [
            ...gitIdentityArgs(identity),
            'commit',
            '-m',
            'loredex: scaffold vault',
          ])
          await deps.git(dir, ['push', '-u', 'origin', branch])
        } catch (e) {
          const out = e instanceof Error ? e.message : String(e)
          const rejected = /reject|non-fast-forward|fetch first|already exists/i.test(out)
          fail(
            rejected ? 'PUSH_REJECTED' : 'REMOTE_UNREACHABLE',
            rejected
              ? 'the remote refused the push (it is not empty anymore) — your LOCAL vault is intact; join the remote instead, or retry from Sync settings'
              : `pushing to the remote failed — ${NO_OAUTH_MESSAGE}. Your LOCAL vault is intact; retry remote wiring from Sync settings`,
            { localVaultCreated: true, gitOutput: out },
          )
        }
      })
    }

    // 6 — first sync.status + seed poll_cursor (fresh cursor = no storm, m2 §4)
    await steps.run('seed', async (post) => {
      if (!remoteUrl) {
        post('done', 'local vault ready — wire a remote later from Sync settings')
        return
      }
      const sha = (await deps.git(dir, ['rev-parse', 'HEAD'])).trim()
      deps.seedCursor(dir, remoteUrl, { branch, sha })
      const health = deps.syncHealth(dir)
      post('done', `pushed to origin/${branch} — sync ${health.state}`)
    })

    return { vaultPath: dir, remoteWired: Boolean(remoteUrl) }
  })
}

// ── join-vault sequence (story 13.2, m2 §7 steps verbatim) ───────────────────

/** Shape rule: `projects/` exists or `.loredex/engine.json` present (m2 §7.3). */
export function looksLikeVault(dest: string): boolean {
  return existsSync(join(dest, 'projects')) || existsSync(join(dest, '.loredex', 'engine.json'))
}

export async function joinVault(
  deps: WizardDeps,
  input: { url: string; dest: string; branch?: string },
): Promise<JoinVaultResult> {
  const { url, dest, branch } = input
  const steps = new StepRunner('join', deps.emit)
  return deps.lock(async () => {
    // 2 — destination pick happened renderer-side; enforce empty-or-new here
    await steps.run('destination', () => ensureEmptyDir(dest))

    // 2b — clone with streamed progress
    await steps.run('clone', async (post) => {
      try {
        await deps.clone(url, dest, branch, (line) => post('running', line))
      } catch (e) {
        fail('CLONE_AUTH_FAILED', `could not clone that repository — ${NO_OAUTH_MESSAGE}`, {
          localVaultCreated: false,
          gitOutput: e instanceof Error ? e.message : String(e),
        })
      }
    })

    // 3 — shape validation; the clone is KEPT either way (never delete a download)
    await steps.run('validate', () => {
      if (!looksLikeVault(dest)) {
        fail(
          'NOT_A_VAULT',
          `cloned, but that repository does not look like a loredex vault (no projects/ folder and no .loredex/engine.json) — the clone was kept at ${dest}`,
          { localVaultCreated: false },
        )
      }
    })

    // 4 — schema handshake: newer-than-supported warns LOUDLY, join continues read-mostly
    const schemaOk = await steps.run('handshake', (post) => {
      const status = deps.schemaStatus(dest)
      if (!status.ok) {
        post(
          'warn',
          `this vault declares loredex schema ${status.declared} but this app supports ${status.supported} — a newer engine wrote here; reading is safe, update Loredex Desktop before writing`,
        )
        return false
      }
      post(
        'done',
        status.declared === null
          ? 'vault predates schema stamping — compatible'
          : `vault schema ${status.declared}, app supports ${status.supported}`,
      )
      return true
    })

    // 5 — register: the loredex config file points every engine on this
    // machine at the joined vault (projects-map merge rides PR-7a when it ships)
    await steps.run('register', () => {
      deps.writeConfig({
        ...(deps.readConfig() ?? { projects: {} }),
        vaultPath: dest,
        sync: 'git',
      })
    })

    // 6 — identity check: blocks WRITES, never reading — warn, don't fail
    await steps.run('identity', (post) => {
      const id = deps.identity()
      if (!id) {
        post(
          'warn',
          'no identity yet — reading works now; set your name and email in Settings before accepting or writing',
        )
      } else {
        post('done', `${id.name} <${id.email}>`)
      }
    })

    // 7 — merge driver + first fetch + fresh-cursor seed (no notification storm)
    await steps.run('finish', async (post) => {
      deps.ensureMergeDriver(dest)
      const head = (await deps.git(dest, ['symbolic-ref', '--short', 'HEAD'])).trim()
      const onBranch = head || branch || 'main'
      await deps.git(dest, ['fetch', 'origin', onBranch])
      const sha = (await deps.git(dest, ['rev-parse', `origin/${onBranch}`])).trim()
      deps.seedCursor(dest, url, { branch: onBranch, sha })
      post('done', `cursor seeded at origin/${onBranch} ${sha.slice(0, 7)} — no notification storm`)
    })

    return { vaultPath: dest, schemaOk }
  })
}
