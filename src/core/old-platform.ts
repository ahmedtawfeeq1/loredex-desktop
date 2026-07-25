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
 * `Authorization: Bearer` header, which the schema cannot express. Extending the
 * lib was the alternative; injecting is better anyway, because the generated
 * `.mcp.json` would hold the expanded token in a file inside the vault, and this
 * keeps it in the OS keychain like every other credential in the app.
 *
 * Only PRESENCE crosses the IPC seam. The token itself reaches exactly two
 * places: the request header at spawn, and the Test round trip.
 */
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
