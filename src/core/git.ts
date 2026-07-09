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
import type { Identity } from '../shared/types'

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
