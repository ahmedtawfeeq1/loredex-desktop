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
  if (!httpOk) return null // no remote transport on this adapter — omit, never half-build
  const token = (resolved.Authorization ?? '').replace(/^Bearer\s+/i, '') || resolved.GENUDO_TOKEN
  if (!token) return null
  return {
    type: 'http',
    name: GENUDO_SERVER,
    url: conn.url ?? `${GENUDO_BASE_URL}/mcp`,
    headers: [{ name: 'Authorization', value: `Bearer ${token}` }],
  } as McpServer
}
