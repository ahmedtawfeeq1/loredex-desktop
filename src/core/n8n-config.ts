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

/**
 * Does the stored URL + key actually authenticate against the n8n instance?
 *
 * A wrong key is otherwise invisible until an agent tries a tool mid-conversation
 * and gets AUTHENTICATION_ERROR — which reads as "the feature is broken" rather
 * than "that credential is wrong". Same principle as the per-client MCP probe:
 * green must mean a real round trip, not merely that something was saved.
 *
 * n8n's public API wants the key in X-N8N-API-KEY. A real key is a JWT
 * (`eyJ…`); a 40-char hex string is a webhook/other token and will 401.
 */
export async function testN8nConnection(): Promise<{ ok: boolean; detail: string }> {
  if (!apiUrl) return { ok: false, detail: 'No instance URL set' }
  if (!apiKey) return { ok: false, detail: 'No API key set — documentation tools only' }
  const base = apiUrl.replace(/\/+$/, '')
  try {
    const res = await fetch(`${base}/api/v1/workflows?limit=1`, {
      headers: { 'X-N8N-API-KEY': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        detail: apiKey.startsWith('eyJ')
          ? 'Rejected (401) — the key is expired or from another instance'
          : "Rejected (401) — this does not look like an n8n API key. A real one is a long JWT starting `eyJ`, from n8n → Settings → API.",
      }
    }
    if (!res.ok) return { ok: false, detail: `Instance returned HTTP ${res.status}` }
    const body = (await res.json()) as { data?: unknown[] }
    const n = Array.isArray(body.data) ? body.data.length : 0
    return { ok: true, detail: `Connected — API reachable (${n} workflow${n === 1 ? '' : 's'} visible)` }
  } catch (e) {
    // wrong host, DNS, TLS, timeout — all "cannot reach", never a thrown page
    return { ok: false, detail: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  }
}
