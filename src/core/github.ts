/**
 * GitHub layer, repo side (story 12.1, architecture-m2.md §6): derive each
 * repo's web base from its REAL origin remote — `git remote get-url origin` —
 * normalized by the one shared rule (shared/github.ts), cached per repo per
 * session. Read-only and network-free in this story; gh-powered PR lookup
 * arrives with story 12.2.
 */
import { execFileSync } from 'node:child_process'
import { githubWebBase } from '../shared/github'

/** sync git runner seam (tests stub it; prod shells out, 10 s guard). */
export type GitRunner = (cwd: string, args: readonly string[]) => string

const defaultRunner: GitRunner = (cwd, args) =>
  execFileSync('git', [...args], { cwd, encoding: 'utf8', timeout: 10_000 })

/** repoRoot → origin url (null = no remote / not a repo), one query per session. */
const remoteCache = new Map<string, string | null>()

/** A repo's origin remote url, cached per repo per session. Failures (no
 *  origin, not a git repo) cache as null — honest plain chips, no retry storm. */
export function originRemote(repoRoot: string, run: GitRunner = defaultRunner): string | null {
  const cached = remoteCache.get(repoRoot)
  if (cached !== undefined) return cached
  let remote: string | null
  try {
    remote = run(repoRoot, ['remote', 'get-url', 'origin']).trim() || null
  } catch {
    remote = null
  }
  remoteCache.set(repoRoot, remote)
  return remote
}

/** THE per-repo commit-link base: real origin remote → normalized GitHub web
 *  base; null = non-GitHub / no remote (chips render plain, never broken). */
export function remoteWebBase(repoRoot: string, run?: GitRunner): string | null {
  return githubWebBase(originRemote(repoRoot, run))
}

/** Test seam: forget cached remotes (a session cache has no prod invalidation). */
export function clearGithubCaches(): void {
  remoteCache.clear()
}
