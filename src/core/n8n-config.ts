/**
 * n8n instance configuration. The API KEY is a secret and lives in the OS
 * keychain (client-tokens), cached in memory and folded into the n8n MCP
 * server's OWN env at spawn — never process.env (so the embedded pty never
 * inherits it), never the vault, never a commit, never a renderer payload.
 * Only presence crosses the seam.
 *
 * The instance URL is NOT a secret and lives in app.db's meta table like any
 * other setting.
 *
 * The key is OPTIONAL: without it n8n-mcp still serves 7 documentation and
 * validation tools; with it, 17 more for creating and running workflows. Both
 * URL and key are required together — a URL with no key cannot authenticate, so
 * that half-configured state stays documentation-only rather than emitting a
 * config the server would reject.
 */
import { deleteClientToken, readClientToken, storeClientToken } from './client-tokens'
import { getAppDb, metaGet, metaSet } from './db/index'

const KEY_REF = 'workspace-mcp/n8n/N8N_API_KEY'
const URL_KEY = 'workspace-mcp:n8n:url'

/** in-memory only — never process.env */
let apiKey: string | null = null
let apiUrl: string | null = null

export async function loadN8nConfig(): Promise<void> {
  apiKey = await readClientToken(KEY_REF)
  const db = getAppDb()
  apiUrl = db ? metaGet(db, URL_KEY) : null
}

export async function setN8nKey(key: string): Promise<void> {
  await storeClientToken(KEY_REF, key)
  apiKey = key // live for the next spawn — no restart
}

export async function clearN8nKey(): Promise<void> {
  await deleteClientToken(KEY_REF)
  apiKey = null
}

export function setN8nUrl(url: string | null): void {
  apiUrl = url && url.trim() ? url.trim() : null
  const db = getAppDb()
  if (db) metaSet(db, URL_KEY, apiUrl)
}

/** Presence only — the key itself never crosses the seam. */
export function n8nStatus(): { hasKey: boolean; url: string | null } {
  return { hasKey: apiKey !== null, url: apiUrl }
}

/** The env n8n-mcp is spawned with. The three log/mode vars are REQUIRED: they
 *  keep the server's debug output off stdout, which is the MCP wire. */
export function n8nEnv(): Record<string, string> {
  const env: Record<string, string> = {
    MCP_MODE: 'stdio',
    LOG_LEVEL: 'error',
    DISABLE_CONSOLE_OUTPUT: 'true',
  }
  if (apiUrl && apiKey) {
    env.N8N_API_URL = apiUrl
    env.N8N_API_KEY = apiKey
  }
  return env
}
