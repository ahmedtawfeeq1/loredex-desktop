/**
 * Session media — images attached to a chat, kept on THIS device.
 *
 * An attached screenshot used to live only in memory: the transcript stored the
 * text marker `📎 image.png` and the bytes vanished with the session, so
 * reopening a conversation showed no picture. This stores the bytes and indexes
 * them in app.db.
 *
 * WHERE, and why it matters:
 *   bytes  → <userData>/session-media/<vault-id>/<sha>.<ext>
 *   index  → app.db `session_media`
 *
 * Both are per-device and NEITHER is inside the vault. That is deliberate, not
 * incidental: a screenshot pasted into a chat is often a customer's order, an
 * invoice, a WhatsApp thread. Putting it in the vault would put it in a commit,
 * a push, and every teammate's dex. Here it cannot leave the machine.
 *
 * Content-addressed by sha256, so the same image attached three times is stored
 * once and the tray's three chips share one file. The index keeps one row per
 * (image, conversation) — that is what makes deletion refcount correctly when
 * two threads happen to hold the same screenshot.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { getAppDb } from './db/index'
import { scratchDir } from './paths'

/** Only real image types — this is a media store, not a file dump. */
const EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/svg+xml': 'svg',
  'image/heic': 'heic',
}

export interface StoredMedia {
  sha256: string
  name: string
  mime: string
  bytes: number
}

function mediaRoot(vaultId: string): string {
  // one folder per vault so removing a vault's media is a directory delete
  const dir = join(scratchDir('session-media'), vaultId)
  mkdirSync(dir, { recursive: true })
  return dir
}

/**
 * Persist one image. Returns its content hash — the handle everything else
 * uses. Storing the same bytes twice is a no-op beyond the index row.
 */
export function storeSessionMedia(
  vaultId: string,
  input: { dataB64: string; mimeType: string; name: string; convId?: string | null },
  now: string,
): StoredMedia {
  const ext = EXT[input.mimeType.toLowerCase()]
  if (!ext) throw new Error(`unsupported media type: ${input.mimeType}`)
  const buf = Buffer.from(input.dataB64, 'base64')
  const sha256 = createHash('sha256').update(buf).digest('hex')
  const rel = join(vaultId, `${sha256}.${ext}`)
  const abs = join(scratchDir('session-media'), rel)
  // content-addressed: identical bytes are already the same file
  if (!existsSync(abs)) {
    mediaRoot(vaultId)
    writeFileSync(abs, buf)
  }
  const db = getAppDb()
  if (db) {
    db.prepare(
      `INSERT INTO session_media (sha256, vault_id, conv_id, name, mime, bytes, rel_path, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(sha256, vault_id, conv_id) DO NOTHING`,
    ).run(sha256, vaultId, input.convId ?? null, input.name, input.mimeType, buf.length, rel, now)
  }
  return { sha256, name: input.name, mime: input.mimeType, bytes: buf.length }
}

/**
 * Read one back for display, as base64.
 *
 * Deliberately ON DEMAND — the transcript carries hashes, not bytes, so opening
 * a long conversation does not drag megabytes of screenshots through the IPC
 * seam and into renderer memory. Only an image actually being looked at is read.
 */
export function readSessionMedia(
  vaultId: string,
  sha256: string,
): { dataB64: string; mime: string; name: string } | null {
  const db = getAppDb()
  if (!db) return null
  const row = db
    .prepare(`SELECT rel_path, mime, name FROM session_media WHERE sha256 = ? AND vault_id = ?`)
    .get(sha256, vaultId) as { rel_path: string; mime: string; name: string } | undefined
  if (!row) return null
  try {
    const abs = join(scratchDir('session-media'), row.rel_path)
    return { dataB64: readFileSync(abs).toString('base64'), mime: row.mime, name: row.name }
  } catch {
    // the index outlived the file (manual cleanup, a moved userData) — a missing
    // picture is not an error worth failing a whole transcript load over
    return null
  }
}

/** Everything a conversation stored, for its transcript. */
export function listConversationMedia(vaultId: string, convId: string): StoredMedia[] {
  const db = getAppDb()
  if (!db) return []
  return db
    .prepare(
      `SELECT sha256, name, mime, bytes FROM session_media
       WHERE vault_id = ? AND conv_id = ? ORDER BY created_at`,
    )
    .all(vaultId, convId) as StoredMedia[]
}

/**
 * Drop a conversation's media when the conversation is deleted — otherwise the
 * store grows forever and holds pictures of conversations the user believes are
 * gone. A file shared with another conversation (same bytes) is kept.
 */
export function deleteConversationMedia(vaultId: string, convId: string): number {
  const db = getAppDb()
  if (!db) return 0
  const rows = db
    .prepare(`SELECT sha256, rel_path FROM session_media WHERE vault_id = ? AND conv_id = ?`)
    .all(vaultId, convId) as { sha256: string; rel_path: string }[]
  let removed = 0
  for (const row of rows) {
    // scoped to THIS vault: the file lives at <vault-id>/<sha>, so another
    // vault referencing the same bytes has its own copy and must not keep this
    // one alive. `IS NOT` (not `!=`) so a NULL conv_id counts as a live holder
    // rather than dropping out of the comparison.
    const others = db
      .prepare(
        `SELECT COUNT(*) AS n FROM session_media
         WHERE sha256 = ? AND vault_id = ? AND conv_id IS NOT ?`,
      )
      .get(row.sha256, vaultId, convId) as { n: number }
    if (others.n === 0) {
      try {
        rmSync(join(scratchDir('session-media'), row.rel_path), { force: true })
        removed += 1
      } catch {
        // best-effort — the index row goes either way
      }
    }
  }
  db.prepare(`DELETE FROM session_media WHERE vault_id = ? AND conv_id = ?`).run(vaultId, convId)
  return removed
}
