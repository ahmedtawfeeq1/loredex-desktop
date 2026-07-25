/**
 * Read a stdio MCP server's advertised tools by doing a real handshake:
 * initialize + tools/list, then kill it. Bounded by a timeout so a wedged server
 * cannot hang the Settings page, and never throws — the caller renders the
 * failure instead.
 *
 * Live rather than hardcoded: a static list would silently drift from what the
 * server actually offers after any version bump.
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

const DEFAULT_TIMEOUT_MS = 9000

export async function probeStdioTools(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
  /** a per-client server is spawned in ITS folder, like the adapter does */
  cwd?: string,
): Promise<{ ok: boolean; tools: string[]; detail: string }> {
  const client = new Client({ name: 'loredex-tools-probe', version: '1.0.0' })
  const transport = new StdioClientTransport({ command, args, env, ...(cwd ? { cwd } : {}) })
  let timer: NodeJS.Timeout | undefined
  try {
    const work = (async (): Promise<string[]> => {
      await client.connect(transport)
      const { tools } = await client.listTools()
      return tools.map((t) => t.name)
    })()
    const tools = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no response within ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
    return { ok: true, tools, detail: `${tools.length} tools` }
  } catch (e) {
    return { ok: false, tools: [], detail: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  } finally {
    if (timer) clearTimeout(timer)
    try {
      await client.close()
    } catch {
      // already dead — closing a failed probe is best-effort
    }
  }
}

/**
 * The same handshake against a REMOTE Streamable HTTP server (LangSmith's).
 * Nothing is spawned, so the failure modes are network ones — a wrong key comes
 * back as a 401 during initialize, which is exactly what we want the Settings
 * card to show rather than an empty tool list.
 */
export async function probeHttpTools(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; tools: string[]; detail: string }> {
  const client = new Client({ name: 'loredex-tools-probe', version: '1.0.0' })
  const transport = new StreamableHTTPClientTransport(new URL(url), {
    requestInit: { headers },
  })
  let timer: NodeJS.Timeout | undefined
  try {
    const work = (async (): Promise<string[]> => {
      await client.connect(transport)
      const { tools } = await client.listTools()
      return tools.map((t) => t.name)
    })()
    const tools = await Promise.race([
      work,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`no response within ${timeoutMs}ms`)), timeoutMs)
      }),
    ])
    return { ok: true, tools, detail: `${tools.length} tools` }
  } catch (e) {
    return { ok: false, tools: [], detail: e instanceof Error ? e.message.split('\n')[0] : String(e) }
  } finally {
    if (timer) clearTimeout(timer)
    try {
      await client.close()
    } catch {
      // already dead — closing a failed probe is best-effort
    }
  }
}
