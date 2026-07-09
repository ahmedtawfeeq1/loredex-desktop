/**
 * Formatting for the vault identity badge (story 1.4). Shared so the chrome
 * badge and the MCP server (story 1.6) echo the exact same strings (F6/FR14).
 */
import type { Identity, VaultIdentity } from './types'

/**
 * A usable consume identity (story 3.4): non-empty name + plausible email.
 * The lib's ambientGitIdentity returns 'unknown' for missing config — that is
 * not a usable identity, so it fails this check and disables consume.
 */
export function isValidIdentity(candidate: unknown): candidate is Identity {
  if (typeof candidate !== 'object' || candidate === null) return false
  const { name, email } = candidate as { name?: unknown; email?: unknown }
  return (
    typeof name === 'string' &&
    name.trim().length > 0 &&
    typeof email === 'string' &&
    /^\S+@\S+\.\S+$/.test(email)
  )
}

/** Abbreviate the user's home directory to `~` for display. */
export function abbreviatePath(path: string, home?: string): string {
  const h = home ?? ''
  if (h && (path === h || path.startsWith(`${h}/`))) return `~${path.slice(h.length)}`
  return path
}

/** Last path segment = the vault's display name. */
export function vaultName(identity: Pick<VaultIdentity, 'vaultPath'>): string {
  const segments = identity.vaultPath.split('/').filter(Boolean)
  return segments[segments.length - 1] ?? identity.vaultPath
}

/** One-line identity string: badge tooltip + MCP response echo use this verbatim. */
export function formatVaultIdentity(identity: VaultIdentity, home?: string): string {
  const parts = [
    abbreviatePath(identity.vaultPath, home),
    `engine loredex ${identity.engineVersion}`,
    `source: ${identity.configSource}`,
  ]
  parts.push(identity.remote ? `remote: ${identity.remote}` : 'no remote')
  return parts.join(' · ')
}
