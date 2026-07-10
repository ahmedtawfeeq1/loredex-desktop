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
import { type CoreEvent, type ErrEnvelope, type IpcCode, ipcError } from '../shared/ipc-contract'
import type {
  Config,
  CreateVaultResult,
  Identity,
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
  identity(): Identity | null
  scaffold(path: string): void
  readConfig(): Config | null
  writeConfig(config: Config): void
  ensureMergeDriver(vaultPath: string): void
  syncHealth(vaultPath: string): SyncHealth
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
  input: { dir: string; remoteUrl?: string },
): Promise<CreateVaultResult> {
  const { dir, remoteUrl } = input
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
      deps.scaffold(dir)
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
