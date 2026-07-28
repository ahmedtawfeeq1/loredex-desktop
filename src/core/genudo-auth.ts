/**
 * Per-client Genudo sign-in (OAuth 2.1, DCR + PKCE S256, scope `mcp:use`).
 *
 * ONE session per client, in the same containment the pasted tokens use — a JSON
 * blob under `clients/<slug>/GENUDO_OAUTH` via client-tokens.ts, so macOS gets the
 * login Keychain and everything else gets the AES-256-GCM machine-keyed map. No new
 * secret store, no new mock surface.
 *
 * WHY sign-in and pasted tokens coexist: a session is only a way to FILL the
 * `${GENUDO_TOKEN_*}` slot workspace.yml already declares. Everything downstream —
 * materialize, ACP, pull, probe — asks for a token and neither knows nor cares which
 * source produced it. Self-hosted deployments and CI keep pasting.
 *
 * Secrets never leave this process: only `signedIn`, the account label and an expiry
 * cross the IPC seam.
 */
import { createServer } from 'node:http'
import { shell } from 'electron'
import {
  auth,
  discoverOAuthServerInfo,
  refreshAuthorization,
} from '@modelcontextprotocol/sdk/client/auth.js'
import type {
  AuthorizationServerMetadata,
  OAuthClientInformation,
  OAuthTokens,
} from '@modelcontextprotocol/sdk/shared/auth.js'
import { deleteClientToken, readClientToken, storeClientToken } from './client-tokens'
import { GENUDO_BASE_URL } from './genudo-http'

/**
 * Fixed loopback port. A registered client's `redirect_uri` must match on every
 * later exchange, so an ephemeral port would invalidate the registration between
 * sign-ins. If the port is busy the sign-in fails loudly rather than silently
 * registering a redirect the authorization server will later reject.
 */
const CALLBACK_PORT = 47821
const REDIRECT_URI = `http://127.0.0.1:${CALLBACK_PORT}/callback`
const SCOPE = 'mcp:use'
/** Refresh this far ahead of expiry, so a token handed out is still valid on arrival. */
const REFRESH_MARGIN_MS = 60_000

interface GenudoSession {
  tokens: OAuthTokens
  /** ms epoch, or null when the server issued no `expires_in` */
  expiresAt: number | null
  account?: string
  tokenEndpoint?: string
  client?: OAuthClientInformation & { redirect_uri?: string }
}

export function genudoSessionRef(client: string): string {
  return `clients/${client}/GENUDO_OAUTH`
}

async function readSession(client: string): Promise<GenudoSession | null> {
  const raw = await readClientToken(genudoSessionRef(client))
  if (!raw) return null
  try {
    return JSON.parse(raw) as GenudoSession
  } catch {
    return null // corrupt blob reads as signed-out; the next sign-in overwrites it
  }
}

async function writeSession(client: string, session: GenudoSession): Promise<void> {
  await storeClientToken(genudoSessionRef(client), JSON.stringify(session))
}

export async function genudoSignOut(client: string): Promise<void> {
  await deleteClientToken(genudoSessionRef(client))
}

export async function genudoStatus(
  client: string,
): Promise<{ signedIn: boolean; account: string | null; expiresAt: number | null }> {
  const session = await readSession(client)
  if (!session) return { signedIn: false, account: null, expiresAt: null }
  return {
    signedIn: true,
    account: session.account ?? null,
    expiresAt: session.expiresAt ?? null,
  }
}

function stamp(tokens: OAuthTokens): number | null {
  return tokens.expires_in ? Date.now() + tokens.expires_in * 1000 : null
}

/**
 * Metadata for a token-endpoint-only call (refresh). `authorization_endpoint` is
 * required by the SDK's `AuthorizationServerMetadata` type but is never read by
 * `refreshAuthorization`/`executeTokenRequest` — only `token_endpoint` is — so this
 * reuses the token endpoint as a placeholder rather than performing a discovery
 * round-trip just to satisfy the type.
 */
function refreshMetadata(tokenEndpoint: string): AuthorizationServerMetadata {
  return {
    issuer: new URL(tokenEndpoint).origin,
    authorization_endpoint: tokenEndpoint,
    token_endpoint: tokenEndpoint,
    response_types_supported: ['code'],
  }
}

/**
 * A fresh access token for this client, or null when it has no session.
 *
 * Throws — rather than returning null — when a session EXISTS but cannot be
 * renewed, because those are different situations for the caller: "never signed
 * in, try the pasted token" versus "signed in and the grant is dead, tell the
 * user to sign in again".
 */
export async function genudoAccessToken(client: string): Promise<string | null> {
  const session = await readSession(client)
  if (!session) return null
  const fresh =
    session.expiresAt === null || session.expiresAt - Date.now() > REFRESH_MARGIN_MS
  if (fresh) return session.tokens.access_token
  const refreshToken = session.tokens.refresh_token
  const tokenEndpoint = session.tokenEndpoint
  if (!refreshToken || !tokenEndpoint || !session.client) {
    await genudoSignOut(client)
    throw new Error(`Genudo session for ${client} expired — sign in again on the client page`)
  }
  try {
    const tokens = await refreshAuthorization(new URL(tokenEndpoint).origin, {
      metadata: refreshMetadata(tokenEndpoint),
      clientInformation: session.client,
      refreshToken,
    })
    await writeSession(client, {
      ...session,
      // a refresh response may omit refresh_token, which means "keep the old one"
      tokens: { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken },
      expiresAt: stamp(tokens),
    })
    return tokens.access_token
  } catch (e) {
    await genudoSignOut(client)
    throw new Error(
      `Genudo session for ${client} could not be renewed (${
        e instanceof Error ? e.message : String(e)
      }) — sign in again on the client page`,
    )
  }
}

/** One-shot loopback listener: resolves with the `code` the browser is redirected to. */
function awaitCallback(timeoutMs = 300_000): { url: string; code: Promise<string> } {
  let settle: ((code: string) => void) | null = null
  let fail: ((e: Error) => void) | null = null
  const code = new Promise<string>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', REDIRECT_URI)
    const got = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      `<body style="font:14px system-ui;padding:3rem">${
        got ? 'Signed in to Genudo. You can close this tab.' : `Sign-in failed: ${error ?? 'no code'}`
      }</body>`,
    )
    server.close()
    if (got) settle?.(got)
    else fail?.(new Error(`Genudo sign-in was refused (${error ?? 'no authorization code'})`))
  })
  server.on('error', (e) => {
    // most binding failures (EADDRINUSE) never actually attach a socket, but a
    // later runtime error could — close defensively so no failure path can
    // leave this port held.
    server.close()
    fail?.(
      new Error(`could not listen on ${REDIRECT_URI} (${e.message}) — close whatever holds that port`),
    )
  })
  server.listen(CALLBACK_PORT, '127.0.0.1')
  const timer = setTimeout(() => {
    server.close()
    fail?.(new Error('Genudo sign-in timed out — no response from the browser'))
  }, timeoutMs)
  // every settle/fail path above must also close the listener — the timeout path
  // closes it directly (its own `server.close()`), and the other paths run inside
  // the request handler which closes on entry, so this only ever needs to clear
  // the timer once the promise is done, on every branch.
  void code.finally(() => clearTimeout(timer))
  return { url: REDIRECT_URI, code }
}

/**
 * Interactive sign-in for one client. Consent opens in the SYSTEM browser so an
 * existing Genudo web session is reused, and so the app never hosts a login form.
 */
export async function genudoSignIn(
  client: string,
  baseUrl: string = GENUDO_BASE_URL,
): Promise<{ account: string | null }> {
  const existing = await readSession(client)
  let stored: GenudoSession = existing ?? { tokens: { access_token: '', token_type: 'Bearer' }, expiresAt: null }
  let verifier = ''
  const callback = awaitCallback()
  const mcpUrl = `${baseUrl.replace(/\/+$/, '')}/mcp`

  const provider = {
    get redirectUrl() {
      return REDIRECT_URI
    },
    get clientMetadata() {
      return {
        client_name: 'Loredex Desktop',
        redirect_uris: [REDIRECT_URI],
        grant_types: ['authorization_code', 'refresh_token'],
        response_types: ['code'],
        token_endpoint_auth_method: 'none',
        scope: SCOPE,
      }
    },
    clientInformation: () =>
      // a registration made for a DIFFERENT redirect_uri is unusable — drop it and
      // let the SDK register again rather than failing at the token exchange
      stored.client?.redirect_uri === REDIRECT_URI ? stored.client : undefined,
    saveClientInformation: (info: OAuthClientInformation) => {
      stored = { ...stored, client: { ...info, redirect_uri: REDIRECT_URI } }
    },
    tokens: () => (stored.tokens.access_token ? stored.tokens : undefined),
    saveTokens: (tokens: OAuthTokens) => {
      stored = { ...stored, tokens, expiresAt: stamp(tokens) }
    },
    redirectToAuthorization: async (authorizationUrl: URL) => {
      await shell.openExternal(authorizationUrl.toString())
    },
    saveCodeVerifier: (v: string) => {
      verifier = v
    },
    codeVerifier: () => verifier,
  }

  const first = await auth(provider, { serverUrl: mcpUrl, scope: SCOPE })
  if (first === 'AUTHORIZED') {
    await writeSession(client, stored)
    return { account: stored.account ?? null }
  }
  const code = await callback.code
  const result = await auth(provider, {
    serverUrl: mcpUrl,
    authorizationCode: code,
    scope: SCOPE,
  })
  if (result !== 'AUTHORIZED') throw new Error('Genudo sign-in did not complete')
  // RFC 9728 + RFC 8414 discovery, same as `auth()` used internally — NOT
  // `discoverAuthorizationServerMetadata(mcpUrl)` directly, because Genudo's
  // authorization server can live at a different origin than the resource
  // server; skipping the RFC 9728 protected-resource-metadata hop would risk
  // persisting a token endpoint the token exchange never actually used.
  const { authorizationServerMetadata } = await discoverOAuthServerInfo(mcpUrl)
  await writeSession(client, {
    ...stored,
    tokenEndpoint: authorizationServerMetadata?.token_endpoint,
  })
  return { account: stored.account ?? null }
}
