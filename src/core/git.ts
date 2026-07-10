/**
 * Git identity injection helpers (story 3.4, F7 "auth is ambient" fix):
 * identity travels with the command, never via ambient global config.
 *
 * Two mechanisms:
 * - `gitIdentityArgs` → `-c user.name=… -c user.email=…` for direct app-side
 *   git shell-outs (the architecture's prescribed form).
 * - `withGitIdentity` → GIT_AUTHOR_ / GIT_COMMITTER_ env vars for the duration
 *   of a lib call, because the lib's gitAutoCommit/gitPullPush don't accept extra
 *   argv yet. Git documents these env vars as overriding all config, so the
 *   effect is identical per-command injection. Recorded deviation; a lib PR
 *   revision threading `-c` args replaces this.
 */
import { execFile, execFileSync } from 'node:child_process'
import { promisify } from 'node:util'
import type { Identity } from '../shared/types'

/**
 * Read-only `git log` runner for the activity feed (story 6.2). Callers pass
 * the lib's ACTIVITY_LOG_ARGS so every host invokes git identically.
 */
export function gitLog(vaultPath: string, args: readonly string[]): string {
  return execFileSync('git', [...args], {
    cwd: vaultPath,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  })
}

const execFileAsync = promisify(execFile)

/**
 * Async git runner for the poller's tick path (story 9.1): fetch and the
 * read-only queries run without blocking the core host. Failures throw with
 * git's stderr in the message so callers can surface it (F8 — never swallow).
 */
export async function gitAsync(
  cwd: string,
  args: readonly string[],
  opts: { timeoutMs?: number; env?: Record<string, string> } = {},
): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      timeout: opts.timeoutMs ?? 60_000,
      ...(opts.env ? { env: { ...process.env, ...opts.env } } : {}),
    })
    return stdout
  } catch (e) {
    const stderr = (e as { stderr?: string }).stderr?.trim()
    throw new Error(stderr || (e instanceof Error ? e.message : String(e)))
  }
}

/**
 * Env that keeps wizard git commands from hanging on interactive auth (story
 * 13.1): terminal prompts off, ssh in batch mode — a private/unreachable
 * remote FAILS with git's own words instead of freezing a step. The app never
 * asks for GitHub login (m2 §7, no OAuth); credentials are the user's own
 * SSH key / credential helper.
 */
export const NON_INTERACTIVE_GIT_ENV: Record<string, string> = {
  GIT_TERMINAL_PROMPT: '0',
  GIT_SSH_COMMAND: 'ssh -oBatchMode=yes',
}

export function gitIdentityArgs(identity: Identity): string[] {
  return ['-c', `user.name=${identity.name}`, '-c', `user.email=${identity.email}`]
}

export function gitIdentityEnv(identity: Identity): Record<string, string> {
  return {
    GIT_AUTHOR_NAME: identity.name,
    GIT_AUTHOR_EMAIL: identity.email,
    GIT_COMMITTER_NAME: identity.name,
    GIT_COMMITTER_EMAIL: identity.email,
  }
}

/** Run `fn` with the identity injected into git's environment; always restores. */
export function withGitIdentity<T>(identity: Identity, fn: () => T): T {
  const env = gitIdentityEnv(identity)
  const saved = new Map<string, string | undefined>()
  for (const [key, value] of Object.entries(env)) {
    saved.set(key, process.env[key])
    process.env[key] = value
  }
  try {
    return fn()
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) delete process.env[key]
      else process.env[key] = value
    }
  }
}
