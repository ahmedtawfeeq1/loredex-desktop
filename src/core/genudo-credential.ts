/**
 * One place that answers "what fills this connection's ${VAR}s right now".
 *
 * Order matters: a live Genudo session BEATS a pasted token, because sign-in is the
 * default path and a stale pasted token would otherwise shadow it silently. Only the
 * `genudo` connection consults the session — every other server keeps its own
 * keychain refs untouched.
 *
 * `clientTokenOverlay` and `resolveConnEnv` treat a dead, unrenewable session
 * DIFFERENTLY on purpose (review finding, 2026-07-29). `genudoAccessToken`
 * signs the client out and THROWS when a session exists but cannot be
 * renewed. `clientTokenOverlay` backs passive reads — the client-page status
 * check on mount, or re-materializing because an UNRELATED token was just
 * pasted — and those callers either discard a thrown message entirely (the
 * status check renders a false "✓ Token held" if the throw isn't caught) or
 * have nothing to do with the genudo credential at all (pasting a CRM token
 * must not fail because Genudo's session died). So it catches the renewal
 * failure and falls back to "no live token", which reads exactly like a
 * client that never signed in — missingRefs correctly lists the ref, the
 * client page shows the real "● Token needed" + Sign-in control.
 * `resolveConnEnv` backs an EXPLICIT action (Pull, Test connection) that
 * cannot proceed without a credential — there the specific "could not be
 * renewed, sign in again" message IS the useful answer, so it must propagate
 * verbatim rather than be swallowed into the more generic "not signed in"
 * text. `liveGenudoToken` is the shared, uncaught call; `clientTokenOverlay`
 * is the only one of the two that wraps it.
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

/** Bare — may throw when a session exists but could not be renewed (the
 *  caller decides whether that's fatal; this function never catches it). */
function liveGenudoToken(client: string): Promise<string | null> {
  return genudoAccessToken(client)
}

/**
 * Every `${VAR}` this machine can fill for one client, ref → value.
 *
 * This is what `generateWorkspace` is fed, so a materialized `.mcp.json` carries a
 * token that is fresh AT WRITE TIME. There is no background refresh — every path
 * that hands work to something outside this process re-materializes first.
 *
 * A dead, unrenewable session degrades to "no live token" rather than
 * throwing — see the module doc for why. Callers that need the specific
 * renewal-failure message use `resolveConnEnv`, not this function.
 */
export async function clientTokenOverlay(
  client: string,
  conns: ClientConnection[],
): Promise<Record<string, string>> {
  const held = await readClientTokens([...new Set(conns.flatMap((c) => c.envRefs))])
  const genudo = conns.find((c) => c.server === GENUDO_SERVER)
  if (genudo) {
    let live: string | null = null
    try {
      live = await liveGenudoToken(client)
    } catch {
      live = null // session existed but couldn't be renewed — read as "not held"
    }
    if (live) for (const ref of genudo.envRefs) held[ref] = live
  }
  return held
}

/**
 * One connection's fields with `${VAR}` expanded. Unlike `clientTokenOverlay`,
 * a genudo connection's renewal failure PROPAGATES here — the caller (Pull,
 * Test connection) explicitly asked for something that cannot work without a
 * credential, so the module doc's "degrade to not signed in" behavior would
 * throw away the more specific, actionable message `genudoAccessToken`
 * already produced.
 */
export async function resolveConnEnv(
  client: string,
  conn: ClientConnection,
): Promise<Record<string, string>> {
  const held = await readClientTokens(conn.envRefs)
  if (conn.server === GENUDO_SERVER) {
    const live = await liveGenudoToken(client) // bare — a renewal failure propagates
    if (live) for (const ref of conn.envRefs) held[ref] = live
  }
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
