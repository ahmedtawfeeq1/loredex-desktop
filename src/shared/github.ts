/**
 * GitHub URL derivation (story 12.1, architecture-m2.md §6) — THE one
 * normalization for every commit link in the app. Pure and bundle-neutral:
 * the core host caches per-repo `git remote get-url origin` lookups around it
 * (src/core/github.ts); the renderer applies it to the already-derived vault
 * remote (VaultIdentity.remote). Supersedes the M1 helpers `remoteCommitBase`
 * (markdown/shaLinks.ts) and `commitBaseOf` (core/atlas.ts) — one derivation,
 * everywhere.
 *
 * GitHub only, by decision: a non-GitHub remote (including GitHub Enterprise
 * hosts) yields null and chips render as plain mono text — never a broken URL.
 */

/** git remote url → normalized https web base, or null when not GitHub.
 *  `git@github.com:o/r.git`, `ssh://git@github.com/o/r`, and
 *  `https://github.com/o/r(.git)` all → `https://github.com/o/r`. */
export function githubWebBase(remote: string | null): string | null {
  if (!remote) return null
  let m = /^https?:\/\/([^/]+)\/(.+?)(?:\.git)?\/?$/.exec(remote)
  if (!m) m = /^(?:ssh:\/\/)?git@([^:/]+)[:/](.+?)(?:\.git)?\/?$/.exec(remote)
  if (!m) return null
  return m[1] === 'github.com' ? `https://github.com/${m[2]}` : null
}

/** `<base>/commit/<sha>` — the one commit-page URL builder. */
export function commitUrl(base: string, sha: string): string {
  return `${base}/commit/${sha}`
}

/** `owner/repo` slug for gh `--repo` (story 12.2); null = not GitHub. */
export function githubRepoSlug(remote: string | null): string | null {
  const base = githubWebBase(remote)
  return base ? base.slice('https://github.com/'.length) : null
}

/** The display form of a commit sha (chips, labels). */
export function shortSha(sha: string): string {
  return sha.slice(0, 7)
}
