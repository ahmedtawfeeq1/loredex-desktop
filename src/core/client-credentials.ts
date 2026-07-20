/**
 * WP-D: per-client login credentials (a client's platform username/password,
 * API console login, etc.) — machine-local, NEVER the vault or a commit. The
 * secret lives in the OS keychain (macOS `security`, service
 * loredex-client-creds) or the AES-256-GCM file fallback; the non-secret
 * metadata (label, username, url, note) lives in a separate encrypted index
 * (`~/.config/loredex/client-logins`) so the card can list logins without ever
 * touching a secret. Reveal is the only path a secret leaves the store.
 *
 * Delegates keychain + encrypted-map I/O to client-tokens.ts (§5.11) — one
 * containment implementation, one mock surface. The file is `client-logins`,
 * distinct from the MCP-token map's `client-credentials`.
 */
import { randomBytes } from 'node:crypto'
import { join } from 'node:path'
import type { ClientCredential } from '../shared/ipc-contract'
import {
  CRED_DIR,
  keychainDelete,
  keychainGet,
  keychainSet,
  readEncMap,
  writeEncMap,
} from './client-tokens'
import { getAppDb, metaGet, metaSet } from './db/index'

const CRED_SERVICE = 'loredex-client-creds'
const LOGINS_FILE = join(CRED_DIR, 'client-logins')

export type { ClientCredential }

const metaKey = (client: string): string => `meta:${client}`
const secretAccount = (client: string, id: string): string => `${client}/${id}`
const secretKey = (client: string, id: string): string => `secret:${secretAccount(client, id)}`

/**
 * BL-22: the metadata index lives in **app.db**, not the encrypted file.
 *
 * It used to share the AES-GCM map with the secrets. That map is keyed off
 * `scrypt(hostname + username)` and `readEncMap` swallows EVERY failure as `{}`
 * — so a single unreadable/undecryptable read makes a client's whole login list
 * vanish silently, and the next write persists the empty list over it. On
 * Windows that is exactly the reported symptom: add a credential, switch client,
 * come back, gone.
 *
 * The metadata is NOT secret (label, username, url, note — never the password),
 * so it belongs in the same durable store as every other app setting: one
 * SQLite row, transactional, already proven across all three platforms. Only the
 * secret still needs platform crypto.
 *
 * No db (bare host / unit tests) falls back to the old encrypted file, and a
 * read still consults the file once so credentials saved by an older build
 * migrate forward on first touch.
 */
const dbKey = (client: string): string => `client-creds:${client}`

function readFileMeta(client: string): ClientCredential[] {
  const raw = readEncMap(LOGINS_FILE)[metaKey(client)]
  if (!raw) return []
  try {
    return JSON.parse(raw) as ClientCredential[]
  } catch {
    return []
  }
}

function readMeta(client: string): ClientCredential[] {
  const db = getAppDb()
  if (!db) return readFileMeta(client)
  const raw = metaGet(db, dbKey(client))
  if (raw !== null) {
    try {
      return JSON.parse(raw) as ClientCredential[]
    } catch {
      return []
    }
  }
  // never written to the db → adopt whatever the pre-BL-22 file holds
  const legacy = readFileMeta(client)
  if (legacy.length > 0) metaSet(db, dbKey(client), JSON.stringify(legacy))
  return legacy
}

function writeMeta(client: string, list: ClientCredential[]): void {
  const db = getAppDb()
  if (db) {
    metaSet(db, dbKey(client), list.length === 0 ? null : JSON.stringify(list))
    return
  }
  const map = readEncMap(LOGINS_FILE)
  if (list.length === 0) delete map[metaKey(client)]
  else map[metaKey(client)] = JSON.stringify(list)
  writeEncMap(LOGINS_FILE, map)
}

async function storeSecret(client: string, id: string, secret: string): Promise<void> {
  if (process.platform !== 'darwin') {
    writeEncMap(LOGINS_FILE, { ...readEncMap(LOGINS_FILE), [secretKey(client, id)]: secret })
    return
  }
  await keychainSet(CRED_SERVICE, secretAccount(client, id), secret)
}

async function readSecret(client: string, id: string): Promise<string | null> {
  if (process.platform !== 'darwin') return readEncMap(LOGINS_FILE)[secretKey(client, id)] ?? null
  return keychainGet(CRED_SERVICE, secretAccount(client, id))
}

async function removeSecret(client: string, id: string): Promise<void> {
  if (process.platform !== 'darwin') {
    const map = readEncMap(LOGINS_FILE)
    delete map[secretKey(client, id)]
    writeEncMap(LOGINS_FILE, map)
    return
  }
  await keychainDelete(CRED_SERVICE, secretAccount(client, id))
}

/** A client's stored logins — metadata only (never a secret). */
export function listCredentials(client: string): ClientCredential[] {
  return readMeta(client)
}

/**
 * Create or edit a login. A new credential (no `id`) mints an opaque id and
 * requires a secret; editing (id present) keeps the existing keychain secret
 * when `secret` is omitted (metadata-only edit — §5.13).
 */
export async function setCredential(
  client: string,
  input: {
    id?: string
    label: string
    username: string
    secret?: string
    url?: string
    note?: string
  },
): Promise<{ id: string }> {
  const id = input.id ?? randomBytes(6).toString('hex')
  const meta: ClientCredential = {
    id,
    label: input.label,
    username: input.username,
    ...(input.url ? { url: input.url } : {}),
    ...(input.note ? { note: input.note } : {}),
  }
  if (input.secret !== undefined && input.secret !== '') {
    await storeSecret(client, id, input.secret)
  } else if (input.id === undefined) {
    throw new Error('a new credential needs a secret')
  }
  const existing = readMeta(client)
  const list =
    existing.findIndex((c) => c.id === id) >= 0
      ? existing.map((c) => (c.id === id ? meta : c)) // edit in place (keep order)
      : [...existing, meta]
  writeMeta(client, list)
  return { id }
}

/** Remove a login — secret AND metadata. */
export async function deleteCredential(client: string, id: string): Promise<void> {
  await removeSecret(client, id)
  writeMeta(
    client,
    readMeta(client).filter((c) => c.id !== id),
  )
}

/** Reveal one secret on demand — the only path a secret leaves the store. */
export async function revealCredential(client: string, id: string): Promise<{ secret: string }> {
  const secret = await readSecret(client, id)
  if (secret === null) throw new Error('no such credential')
  return { secret }
}
