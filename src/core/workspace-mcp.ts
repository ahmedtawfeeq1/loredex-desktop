/**
 * WORKSPACE MCP servers — the third category, alongside our own loredex host and
 * the per-client `.mcp.json` servers the adapter discovers from its cwd. These
 * belong to the whole vault: one n8n instance, one key, every session.
 *
 * Registry-driven so adding a server is one row, not a new branch in acp.ts.
 */
import type { McpServer } from '@agentclientprotocol/sdk'
import { n8nEnv } from './n8n-config'
import { n8nEntryPath } from './n8n-install'

export type WorkspaceServerId = 'loredex' | 'n8n'

export interface WorkspaceCtx {
  /** the loredex http host this session should use, or null when unreachable */
  loredex: { url: string; token: string } | null
  /** the adapter advertised mcpCapabilities.http */
  httpOk: boolean
  enabled: Record<WorkspaceServerId, boolean>
}

const asEnv = (env: Record<string, string>): { name: string; value: string }[] =>
  Object.entries(env).map(([name, value]) => ({ name, value }))

/**
 * Build the servers for one session. A server that cannot be built correctly is
 * OMITTED, never half-built: a malformed entry can fail the whole session, and
 * losing one optional tool set is strictly better than losing the session.
 */
export function buildWorkspaceServers(ctx: WorkspaceCtx): McpServer[] {
  const servers: McpServer[] = []

  if (ctx.enabled.loredex && ctx.httpOk && ctx.loredex) {
    servers.push({
      type: 'http',
      name: 'loredex',
      url: ctx.loredex.url,
      headers: [{ name: 'Authorization', value: `Bearer ${ctx.loredex.token}` }],
    } as McpServer)
  }

  if (ctx.enabled.n8n) {
    const entry = n8nEntryPath()
    // not installed → omit. The Settings card is where the user installs it.
    if (entry) {
      servers.push({
        name: 'n8n',
        command: process.execPath,
        args: [entry],
        // ELECTRON_RUN_AS_NODE makes our Electron binary behave as plain node —
        // the same trick the ACP adapters use, so no system node is relied on.
        env: asEnv({
          ...n8nEnv(),
          ELECTRON_RUN_AS_NODE: '1',
          PATH: process.env.PATH ?? '',
          HOME: process.env.HOME ?? '',
        }),
      } as McpServer)
    }
  }

  return servers
}
