/**
 * The OLD genudo platform, as a PER-CLIENT MCP server.
 *
 * A client can sit on both platforms during a migration, so this is a second
 * connection alongside the new-platform `genudo` one — its own token, its own
 * Test, scoped to that client's folder. Sessions for other clients never see it.
 *
 * WHY IT IS INJECTED HERE rather than declared in `workspace.yml`. That file's
 * schema (loredex lib `workspaceSchema`) models **stdio** servers only —
 * `command` / `args` / `env`. The old platform is remote HTTP with an
 * `Authorization: Bearer` header, which the schema cannot express, so the
 * keychain is its home and this module is what hands it out.
 *
 * TWO CONSUMERS, one source (2026-07-25). `oldPlatformServer` covers sessions
 * this app spawns (Chat Here / ACP); `syncOldPlatformMcp` mirrors the same
 * server into the client's generated `.mcp.json` so an EXTERNAL agent — Claude
 * Code in the terminal, `Open in Terminal` — sees it too. Before that mirror,
 * the old platform silently did not exist outside the app.
 *
 * Only PRESENCE crosses the IPC seam. The token itself reaches the request
 * header at spawn, the Test round trip, and the gitignored `.mcp.json`.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { deleteClientToken, readClientToken, storeClientToken } from './client-tokens'
import { probeHttpTools } from './mcp-tools'

/** The old platform's single hosted endpoint — same for every client; only the
 *  token differs, which is what scopes it to a workspace. */
export const OLD_PLATFORM_URL =
  'https://fymcfqykdtxkhhwvszqg.supabase.co/functions/v1/genudo-mcp'

/** The server name the agent sees. Deliberately distinct from the new
 *  platform's `genudo`, so an agent can never confuse the two mid-migration. */
export const OLD_PLATFORM_SERVER = 'genudo-old-platform'

/** Keychain ref, per client — the same shape the workspace connections use. */
export function oldPlatformRef(client: string): string {
  return `clients/${client}/GENUDO_OLD_PLATFORM_TOKEN`
}

export async function setOldPlatformToken(client: string, token: string): Promise<void> {
  await storeClientToken(oldPlatformRef(client), token.trim())
}

export async function clearOldPlatformToken(client: string): Promise<void> {
  await deleteClientToken(oldPlatformRef(client))
}

/** Presence only — never the token. */
export async function oldPlatformStatus(client: string): Promise<{ hasToken: boolean }> {
  return { hasToken: (await readClientToken(oldPlatformRef(client))) !== null }
}

/**
 * The MCP entry for this client's session, or null when no token is stored.
 *
 * Omitted rather than half-built, for the same reason as every other server
 * here: an unauthenticated entry fails every tool call and reads as a broken
 * feature rather than an unconfigured one.
 */
export async function oldPlatformServer(
  client: string | null,
): Promise<{ type: 'http'; name: string; url: string; headers: { name: string; value: string }[] } | null> {
  if (!client) return null
  const token = await readClientToken(oldPlatformRef(client))
  if (!token) return null
  return {
    type: 'http',
    name: OLD_PLATFORM_SERVER,
    url: OLD_PLATFORM_URL,
    headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
  }
}

/**
 * Byte-identical to the lib's own `.mcp.json` writer (sorted keys, 2-space,
 * trailing newline) — a different shape here would make every `--check` report
 * drift and light the Re-wire warning forever.
 */
function stableJson(value: unknown): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') {
      const out: Record<string, unknown> = {}
      for (const key of Object.keys(v as Record<string, unknown>).sort()) {
        out[key] = sort((v as Record<string, unknown>)[key])
      }
      return out
    }
    return v
  }
  return `${JSON.stringify(sort(value), null, 2)}\n`
}

/**
 * Mirror this client's old-platform server into its generated `.mcp.json`, so
 * agents OUTSIDE this app get it too. No token → the entry is removed, which is
 * what makes Replace-with-empty and Clear actually take effect in the terminal.
 *
 * The token lands expanded in that file. That tradeoff is already the standing
 * one: `.mcp.json` is gitignored per client and the NEW platform's token sits
 * there expanded for exactly the same reason — a file the agent can read is the
 * only channel an external process has.
 *
 * Merge-preserving, like the lib's writer: foreign servers survive untouched.
 * No generated file yet → nothing to mirror into; the next Wire calls us again.
 */
export async function syncOldPlatformMcp(clientDir: string, client: string): Promise<void> {
  const path = join(clientDir, '.mcp.json')
  if (!existsSync(path)) return
  let json: { mcpServers?: Record<string, unknown> }
  try {
    json = JSON.parse(readFileSync(path, 'utf8')) as { mcpServers?: Record<string, unknown> }
  } catch {
    return // unreadable generated file — Re-wire rewrites it cleanly, then we run
  }
  json.mcpServers ??= {}
  const token = await readClientToken(oldPlatformRef(client))
  if (token) {
    json.mcpServers[OLD_PLATFORM_SERVER] = {
      type: 'http',
      url: OLD_PLATFORM_URL,
      headers: { Authorization: `Bearer ${token}` },
    }
  } else if (!(OLD_PLATFORM_SERVER in json.mcpServers)) {
    return // nothing stored, nothing written — leave the file's mtime alone
  } else {
    delete json.mcpServers[OLD_PLATFORM_SERVER]
  }
  writeFileSync(path, stableJson(json))
}

/**
 * A real MCP handshake with the stored token — green here means an agent would
 * actually get tools, not merely that something was saved. Same promise as the
 * n8n / LangSmith / per-client probes.
 */
export async function testOldPlatform(
  client: string,
): Promise<{ ok: boolean; detail: string; tools: string[] }> {
  const token = await readClientToken(oldPlatformRef(client))
  if (!token) return { ok: false, detail: 'No old-platform token stored for this client', tools: [] }
  const res = await probeHttpTools(
    OLD_PLATFORM_URL,
    { Authorization: `Bearer ${token}` },
    12_000,
  )
  if (res.ok) {
    return { ...res, detail: `Connected — ${res.tools.length} tools` }
  }
  // a rejected token is the common case and reads as "broken feature" otherwise
  const auth = /401|403|unauthor|forbidden/i.test(res.detail)
  return {
    ...res,
    detail: auth
      ? 'Rejected — this token is not valid for the old platform (generate a fresh one and paste it again)'
      : res.detail,
  }
}
