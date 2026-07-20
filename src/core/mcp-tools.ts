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

const DEFAULT_TIMEOUT_MS = 9000

export async function probeStdioTools(
  command: string,
  args: string[],
  env: Record<string, string>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<{ ok: boolean; tools: string[]; detail: string }> {
  const client = new Client({ name: 'loredex-tools-probe', version: '1.0.0' })
  const transport = new StdioClientTransport({ command, args, env })
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
