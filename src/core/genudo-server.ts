/**
 * The per-client `genudo` MCP server for ONE session.
 *
 * Remote HTTP only. Verified 2026-07-28: `@agentclientprotocol/codex-acp@1.1.4`
 * advertises `{acp: false, http: true, sse: false}` and the Claude adapter
 * advertises `{http, sse}`, so every adapter this app spawns can take a remote
 * server — a stdio fallback would be code no session reaches. An adapter without
 * http gets no Genudo, the same omit-rather-than-half-build rule `old-platform.ts`
 * and `workspace-mcp.ts` already follow.
 */
import type { McpServer } from '@agentclientprotocol/sdk'
import { clientConnections } from './engine'
import { GENUDO_SERVER, resolveConnEnv } from './genudo-credential'
import { GENUDO_BASE_URL } from './genudo-http'

export async function genudoServerFor(
  client: string | null,
  httpOk: boolean,
): Promise<McpServer | null> {
  // Checked FIRST, before any credential is touched. resolveConnEnv below
  // calls through to genudoAccessToken, which SIGNS THE CLIENT OUT when a
  // live session exists but cannot be renewed — a real, silent side effect.
  // `httpOk` goes false on any handshake that omits the capability field, not
  // just a hypothetical stdio-only adapter, so an ordinary session could hit
  // that path today. Bail before resolving anything so a doomed lookup (the
  // server is discarded either way once we reach the bottom) can never
  // destroy a stored OAuth session on its way to being thrown away.
  if (!httpOk) return null
  if (!client) return null
  // Flattened rather than the discriminated union `clientConnections` returns:
  // every field but `server`/`envRefs` only exists on one branch of that union,
  // and this function only ever reads the http-shaped fields.
  let conn:
    | {
        url?: string
        headers?: Record<string, string>
        envRefs: string[]
        server: string
        env?: Record<string, string>
      }
    | undefined
  try {
    conn = clientConnections(client).find((c) => c.server === GENUDO_SERVER)
  } catch {
    return null // no/invalid workspace.yml — nothing to attach
  }
  if (!conn) return null
  let resolved: Record<string, string>
  try {
    resolved = await resolveConnEnv(client, conn)
  } catch {
    // Not a programming error — resolveConnEnv throws BY DESIGN when the
    // client isn't signed in (or a live session exists but couldn't be
    // renewed; see genudo-credential.ts's module doc). This call site can't
    // surface that message anywhere a human would see it, so it omits the
    // server rather than attach one that would 401 on every tool call —
    // same rule old-platform.ts and workspace-mcp.ts already follow.
    return null
  }
  const token = (resolved.Authorization ?? '').replace(/^Bearer\s+/i, '') || resolved.GENUDO_TOKEN
  if (!token) return null
  return {
    type: 'http',
    name: GENUDO_SERVER,
    // `conn.url` is already the FULL endpoint (`.../mcp`) — passed through
    // unmodified, never stripped/re-appended (that's handlers.ts's
    // `genudoBaseUrl`, a different code path for callers that append their
    // own suffix). The fallback is for an unmigrated client's stdio shape,
    // which has no `url` at all: `resolved.GENUDO_BASE_URL` is that
    // connection's OWN expanded env var (e.g. a self-hosted override), so it
    // wins over the production default — an unmigrated self-hosted client
    // must not get silently pointed at prod.
    url: conn.url ?? `${(resolved.GENUDO_BASE_URL ?? GENUDO_BASE_URL).replace(/\/+$/, '')}/mcp`,
    headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
  } as McpServer
}
