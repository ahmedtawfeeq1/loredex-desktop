/**
 * Recently-opened vaults — the app-wide list behind the vault switcher menu
 * (D1 amendment 7 §D). Pure list logic only: newest-first, dedup by path,
 * capped. Persistence (main-owned JSON, like vault.json bootstrap config) and
 * the basename derivation live in src/main/dialogs.ts; this module never
 * imports electron so it stays node-testable.
 */
export interface RecentVault {
  /** absolute vault path (the identity key) */
  path: string
  /** display name — the vault folder's basename */
  name: string
  /** ISO timestamp of the most recent open */
  openedAt: string
}

export const MAX_RECENT_VAULTS = 8

/**
 * Front-insert `entry`, drop any prior entry with the same path (so re-opening
 * a vault moves it to the top, never duplicates), cap the list. Deterministic
 * and side-effect free — the persistence layer wraps this.
 */
export function pushRecent(
  list: readonly RecentVault[],
  entry: RecentVault,
  cap: number = MAX_RECENT_VAULTS,
): RecentVault[] {
  const deduped = list.filter((v) => v.path !== entry.path)
  return [entry, ...deduped].slice(0, Math.max(0, cap))
}

/** Vault display name from an absolute path: the trailing path segment. */
export function vaultNameFromPath(path: string): string {
  const parts = path.split(/[/\\]/).filter(Boolean)
  return parts[parts.length - 1] ?? path
}
