/**
 * LangSmith configuration — tracing and evaluation for the AI agents' work.
 *
 * Same seam rules as n8n (n8n-config.ts): the API KEY is a secret and lives in
 * the OS keychain, cached in memory, folded into the server's own request
 * headers — never process.env, never the vault, never a commit, never a renderer
 * payload. Only presence crosses the seam. The endpoint and project name are not
 * secrets and live in app.db's meta table.
 *
 * WHY THIS ONE IS NOT AN INSTALL. n8n ships an npm MCP server we download on
 * demand; LangSmith's is a REMOTE server — Streamable HTTP at `<endpoint>/mcp`,
 * authenticated per request with `X-Api-Key`. There is nothing to install, and
 * the standalone alternative (`langsmith-mcp-server` on PyPI) would drag in a
 * Python + uv toolchain we do not otherwise require. So: no install step, and
 * the server is simply OMITTED from a session until a key is stored.
 *
 * Docs: https://docs.langchain.com/langsmith/langsmith-remote-mcp
 */
import { deleteClientToken, readClientToken, storeClientToken } from './client-tokens'
import { getAppDb, metaGet, metaSet } from './db/index'

const KEY_REF = 'workspace-mcp/langsmith/LANGSMITH_API_KEY'
const URL_KEY = 'workspace-mcp:langsmith:url'
const PROJECT_KEY = 'workspace-mcp:langsmith:project'

/** GCP US. The other regions are separate hosts, not a query parameter, so a
 *  user on EU/APAC/AWS or self-hosted must set their own. */
export const LANGSMITH_DEFAULT_ENDPOINT = 'https://api.smith.langchain.com'

/** Where traces land when nothing is set — the tracing plugin's own default. */
export const LANGSMITH_DEFAULT_PROJECT = 'claude-code'

/** in-memory only — never process.env */
let apiKey: string | null = null
let endpoint: string | null = null
let project: string | null = null

export async function loadLangsmithConfig(): Promise<void> {
  apiKey = await readClientToken(KEY_REF)
  const db = getAppDb()
  endpoint = db ? metaGet(db, URL_KEY) : null
  project = db ? metaGet(db, PROJECT_KEY) : null
}

export async function setLangsmithKey(key: string): Promise<void> {
  await storeClientToken(KEY_REF, key)
  apiKey = key // live for the next spawn — no restart
}

export async function clearLangsmithKey(): Promise<void> {
  await deleteClientToken(KEY_REF)
  apiKey = null
}

export function setLangsmithEndpoint(url: string | null): void {
  endpoint = url?.trim() ? url.trim() : null
  const db = getAppDb()
  if (db) metaSet(db, URL_KEY, endpoint)
}

export function setLangsmithProject(name: string | null): void {
  project = name?.trim() ? name.trim() : null
  const db = getAppDb()
  if (db) metaSet(db, PROJECT_KEY, project)
}

/** The endpoint actually in force — the stored one, or GCP US. */
export function langsmithEndpoint(): string {
  return (endpoint ?? LANGSMITH_DEFAULT_ENDPOINT).replace(/\/+$/, '')
}

export function langsmithProject(): string {
  return project ?? LANGSMITH_DEFAULT_PROJECT
}

/**
 * The key itself, for CORE-SIDE callers only (the trace fetch). It must never
 * be returned from an IPC handler — `langsmithStatus()` is what the seam sees.
 */
export function langsmithApiKey(): string | null {
  return apiKey
}

/** Presence only — the key itself never crosses the seam. */
export function langsmithStatus(): {
  hasKey: boolean
  url: string | null
  project: string | null
} {
  return { hasKey: apiKey !== null, url: endpoint, project }
}

/**
 * The remote MCP endpoint + auth header for one session, or null when no key is
 * stored (the server is then omitted rather than half-built: an unauthenticated
 * entry fails every tool call and reads as a broken feature).
 *
 * `X-Api-Key` is the Remote MCP's header — deliberately NOT the standalone
 * server's `LANGSMITH-API-KEY`, and not `Authorization: Bearer`.
 */
export function langsmithHttp(): { url: string; header: { name: string; value: string } } | null {
  if (!apiKey) return null
  return {
    url: `${langsmithEndpoint()}/mcp`,
    header: { name: 'X-Api-Key', value: apiKey },
  }
}

/**
 * Does the stored key actually authenticate against LangSmith?
 *
 * Same principle as the n8n and per-client probes: green must mean a real round
 * trip, not merely that something was saved. `/api/v1/sessions` is the tracing
 * PROJECTS list (LangSmith's API still calls a project a session) — it needs
 * auth, so a 401 here is exactly the failure an agent would hit mid-conversation.
 */
export async function testLangsmithConnection(): Promise<{ ok: boolean; detail: string }> {
  if (!apiKey) return { ok: false, detail: 'No API key set' }
  const base = langsmithEndpoint()
  try {
    const res = await fetch(`${base}/api/v1/sessions?limit=1`, {
      headers: { 'X-Api-Key': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(10_000),
    })
    if (res.status === 401 || res.status === 403) {
      return {
        ok: false,
        detail: apiKey.startsWith('lsv2_')
          ? 'Rejected (401) — the key is revoked, or belongs to a different region than this endpoint'
          : "Rejected (401) — this does not look like a LangSmith key. A real one starts `lsv2_`, from LangSmith → Settings → API keys.",
      }
    }
    if (!res.ok) return { ok: false, detail: `LangSmith returned HTTP ${res.status}` }
    const body = (await res.json()) as unknown
    const n = Array.isArray(body) ? body.length : 0
    return {
      ok: true,
      detail: `Connected — API reachable (${n} tracing project${n === 1 ? '' : 's'} visible)`,
    }
  } catch (e) {
    // wrong host, DNS, TLS, timeout — all "cannot reach", never a thrown page
    return { ok: false, detail: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  }
}
