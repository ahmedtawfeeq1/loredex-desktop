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
import { execFile, execFileSync, spawn } from 'node:child_process'
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
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

// ── GIT_ASKPASS shim (AUTH-GITHUB §3, story 26.9) ────────────────────────────
// HTTPS remotes get credentials from the stored GitHub token via an injected
// askpass helper: username prompts answer `x-access-token`, password prompts
// answer $LOREDEX_GIT_TOKEN — the token rides the child env only, never disk,
// never argv. SSH remotes bypass all of this untouched (env is additive).

let askpassPath: string | null = null

/** Write the tiny askpass helper once per process (0700, temp dir). */
function ensureAskpassHelper(): string {
  if (askpassPath) return askpassPath
  const dir = mkdtempSync(join(tmpdir(), 'loredex-askpass-'))
  const file = join(dir, 'askpass.sh')
  writeFileSync(
    file,
    '#!/bin/sh\ncase "$1" in\n  *[Uu]sername*) echo "x-access-token" ;;\n  *) echo "$LOREDEX_GIT_TOKEN" ;;\nesac\n',
    { mode: 0o700 },
  )
  chmodSync(file, 0o700)
  askpassPath = file
  return file
}

/** The token the shim serves — cached by the auth layer (core boot + every
 *  login/logout). Empty = shim inert (git falls back to the user's own
 *  credential helpers exactly as before). */
let cachedGitToken = ''

export function setGitCredentialToken(token: string | null): void {
  cachedGitToken = token ?? ''
}

/** Env to splice into any git spawn that may hit an HTTPS GitHub remote.
 *  An explicit in-app sign-in must WIN over whatever credential helpers the
 *  machine carries (gh CLI installs itself as the github.com helper and
 *  serves its ACTIVE account — the wrong-account trap): empty helper values
 *  via env config RESET the helper list, so git falls through to our
 *  askpass. No token cached = empty env = the user's own setup, untouched. */
export function gitCredentialEnv(): Record<string, string> {
  if (!cachedGitToken) return {}
  return {
    GIT_ASKPASS: ensureAskpassHelper(),
    LOREDEX_GIT_TOKEN: cachedGitToken,
    GIT_CONFIG_COUNT: '3',
    GIT_CONFIG_KEY_0: 'credential.helper',
    GIT_CONFIG_VALUE_0: '',
    GIT_CONFIG_KEY_1: 'credential.https://github.com.helper',
    GIT_CONFIG_VALUE_1: '',
    GIT_CONFIG_KEY_2: 'credential.https://gist.github.com.helper',
    GIT_CONFIG_VALUE_2: '',
  }
}

/**
 * `git clone --progress` with streamed progress lines (story 13.2 AC1). Git
 * writes progress to stderr with \r rewrites; lines are split on both, phase
 * lines pass through and percent rewrites are throttled to ~3/s. On failure
 * the promise rejects with the stderr tail — git's own words (F8).
 */
export function gitCloneStreaming(
  url: string,
  dest: string,
  branch: string | undefined,
  onProgress: (line: string) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const args = ['clone', '--progress', ...(branch ? ['--branch', branch] : []), url, dest]
    const child = spawn('git', args, { env: { ...process.env, ...NON_INTERACTIVE_GIT_ENV } })
    const tail: string[] = []
    let pending = ''
    let lastEmit = 0
    child.stderr.on('data', (chunk: Buffer) => {
      pending += chunk.toString('utf8')
      const lines = pending.split(/\r\n|\r|\n/)
      pending = lines.pop() ?? ''
      for (const raw of lines) {
        const line = raw.trim()
        if (!line) continue
        tail.push(line)
        if (tail.length > 20) tail.shift()
        const now = Date.now()
        if (!line.includes('%') || now - lastEmit > 300) {
          lastEmit = now
          onProgress(line)
        }
      }
    })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(tail.join('\n') || `git clone exited with code ${code}`))
    })
  })
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
