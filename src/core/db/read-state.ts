/**
 * Read/unread per note (story 9.2 / epic3.story6). Per-user by definition —
 * NEVER vault frontmatter (architecture.md#state-placement). note_path is the
 * vault-relative path (stable across machines with different checkouts).
 */
import type { AppDb } from './index'

/** read_at ISO per requested path; null = never read (unread dot). */
export function getReadState(
  db: AppDb,
  vaultId: string,
  paths: string[],
): Record<string, string | null> {
  const select = db.prepare(
    'SELECT read_at FROM read_state WHERE vault_id = ? AND note_path = ?',
  )
  const out: Record<string, string | null> = {}
  for (const path of paths) {
    const row = select.get(vaultId, path) as { read_at: string | null } | undefined
    out[path] = row?.read_at ?? null
  }
  return out
}

export function markRead(
  db: AppDb,
  vaultId: string,
  paths: string[],
  readAt: string = new Date().toISOString(),
): void {
  const upsert = db.prepare(
    'INSERT INTO read_state (vault_id, note_path, read_at) VALUES (?, ?, ?) ON CONFLICT(vault_id, note_path) DO UPDATE SET read_at = excluded.read_at',
  )
  db.transaction(() => {
    for (const path of paths) upsert.run(vaultId, path, readAt)
  })()
}
