/**
 * Genudo over Streamable HTTP — the whole transport.
 *
 * The backend retired SSE on 2026-07-28: there is one endpoint, `POST {BASE}/mcp`,
 * it is stateless, and the `initialize` handshake is optional (`tools/list` as a
 * first request answers 29 tools). So this is a plain request/response client with
 * no connection to manage, which is why the npx bridge, the Node runtime, the PATH
 * widening and the Windows `cmd /c` workaround all disappear from the pull path.
 *
 * Two pieces of cheap insurance against a server-side change Genudo has not made:
 * an `text/event-stream` body is unwrapped if one ever arrives, and a
 * `Mcp-Session-Id` response header is echoed on every subsequent request.
 */
export const GENUDO_BASE_URL = 'https://api.genudo.ai'

/** Pull the JSON payload out of an SSE frame — `data:` lines, concatenated. */
function unwrapSse(text: string): string {
  return text
    .split('\n')
    .filter((line) => line.startsWith('data:'))
    .map((line) => line.slice(5).trim())
    .join('')
}

export function genudoRpc(
  baseUrl: string,
  token: string,
  timeoutMs = 120_000,
): { callTool(name: string, args?: Record<string, unknown>): Promise<unknown> } {
  const endpoint = `${baseUrl.replace(/\/+$/, '')}/mcp`
  let id = 0
  let sessionId: string | null = null

  async function rpc(method: string, params: Record<string, unknown>): Promise<unknown> {
    const signal = AbortSignal.timeout(timeoutMs)
    const res = await fetch(endpoint, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
        Authorization: `Bearer ${token}`,
        ...(sessionId ? { 'Mcp-Session-Id': sessionId } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
    const issued = res.headers.get('mcp-session-id')
    if (issued) sessionId = issued
    if (!res.ok) {
      // 401 is the common one and means the credential, not the server, is wrong
      throw new Error(`genudo ${method} failed — HTTP ${res.status} ${res.statusText}`.trim())
    }
    if (res.status === 204) return null
    const raw = await res.text()
    if (!raw.trim()) return null
    const body = (res.headers.get('content-type') ?? '').includes('text/event-stream')
      ? unwrapSse(raw)
      : raw
    const json = JSON.parse(body) as {
      result?: unknown
      error?: { code: number; message: string }
    }
    if (json.error) throw new Error(`genudo ${method} failed — ${json.error.message}`)
    return json.result ?? null
  }

  return {
    async callTool(name, args = {}) {
      const result = (await rpc('tools/call', { name, arguments: args })) as {
        content?: { type: string; text?: string }[]
      } | null
      if (result === null) return null
      const text = (result.content ?? [])
        .filter((c) => c.type === 'text')
        .map((c) => c.text ?? '')
        .join('\n')
      try {
        return JSON.parse(text)
      } catch {
        return text
      }
    },
  }
}
