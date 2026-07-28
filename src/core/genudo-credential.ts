/**
 * One place that answers "what fills this connection's ${VAR}s right now".
 *
 * Order matters: a live Genudo session BEATS a pasted token, because sign-in is the
 * default path and a stale pasted token would otherwise shadow it silently. Only the
 * `genudo` connection consults the session — every other server keeps its own
 * keychain refs untouched.
 */
import { readClientTokens } from './client-tokens'
import { genudoAccessToken } from './genudo-auth'

export const GENUDO_SERVER = 'genudo'
const ENV_REF = /\$\{([A-Z0-9_]+)\}/g

export interface ClientConnection {
  server: string
  envRefs: string[]
  env?: Record<string, string>
  headers?: Record<string, string>
  url?: string
  command?: string
  args?: string[]
}

/**
 * Every `${VAR}` this machine can fill for one client, ref → value.
 *
 * This is what `generateWorkspace` is fed, so a materialized `.mcp.json` carries a
 * token that is fresh AT WRITE TIME. There is no background refresh — every path
 * that hands work to something outside this process re-materializes first.
 */
export async function clientTokenOverlay(
  client: string,
  conns: ClientConnection[],
): Promise<Record<string, string>> {
  const held = await readClientTokens([...new Set(conns.flatMap((c) => c.envRefs))])
  const genudo = conns.find((c) => c.server === GENUDO_SERVER)
  if (genudo) {
    const live = await genudoAccessToken(client)
    if (live) for (const ref of genudo.envRefs) held[ref] = live
  }
  return held
}

export async function resolveConnEnv(
  client: string,
  conn: ClientConnection,
): Promise<Record<string, string>> {
  const held = await clientTokenOverlay(client, [conn])
  const source = conn.headers ?? conn.env ?? {}
  const out: Record<string, string> = {}
  const missing: string[] = []
  for (const [key, value] of Object.entries(source)) {
    out[key] = value.replace(ENV_REF, (whole, ref: string) => {
      const token = held[ref]
      if (token === undefined) missing.push(ref)
      return token ?? whole
    })
  }
  if (missing.length > 0) {
    throw new Error(
      conn.server === GENUDO_SERVER
        ? `${client} is not signed in to Genudo — use Sign in on the client page (or paste a token)`
        : `no token held for ${missing.join(', ')} — paste it in Agent tooling first`,
    )
  }
  return out
}
