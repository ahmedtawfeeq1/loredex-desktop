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
  selectResourceURL,
} from '@modelcontextprotocol/sdk/client/auth.js'
import {
  InvalidClientError,
  InvalidGrantError,
  UnauthorizedClientError,
} from '@modelcontextprotocol/sdk/server/auth/errors.js'
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
export const CALLBACK_PORT = 47821
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
  /** RFC 9728: the authorization server's own base URL, when discovery found one. */
  authorizationServerUrl?: string
  tokenEndpointAuthMethodsSupported?: string[]
  /** RFC 8707 resource indicator, echoed back on every refresh once the auth server requires it. */
  resource?: string
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
 * Best-effort account label from the token response's OIDC `id_token` —
 * decoded, NOT verified (no JWKS fetch, no network call: it only ever
 * populates a display label, never anything security-relevant). Prefers
 * `email`, falls back to `sub`, and returns undefined for anything else
 * (no id_token, malformed JWT, neither claim present) — callers keep
 * whatever label they already had rather than blanking it out.
 */
function accountFromIdToken(idToken: string | undefined): string | undefined {
  if (!idToken) return undefined
  const payload = idToken.split('.')[1]
  if (!payload) return undefined
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as {
      email?: unknown
      sub?: unknown
    }
    if (typeof claims.email === 'string' && claims.email) return claims.email
    if (typeof claims.sub === 'string' && claims.sub) return claims.sub
    return undefined
  } catch {
    return undefined // malformed id_token — no label, not fatal
  }
}

/**
 * Metadata for a token-endpoint-only call (refresh). `authorization_endpoint`
 * is required by the SDK's `AuthorizationServerMetadata` type but is never
 * read by `refreshAuthorization`/`executeTokenRequest` — only `token_endpoint`
 * (and, when present, `token_endpoint_auth_methods_supported`) are — so this
 * reuses the token endpoint as an `authorization_endpoint` placeholder rather
 * than performing a discovery round-trip just to satisfy the type. `issuer`
 * and the supported-auth-methods list use whatever sign-in persisted, when
 * available, instead of being fabricated.
 */
function refreshMetadata(session: GenudoSession, tokenEndpoint: string): AuthorizationServerMetadata {
  return {
    issuer: session.authorizationServerUrl ?? new URL(tokenEndpoint).origin,
    authorization_endpoint: tokenEndpoint,
    token_endpoint: tokenEndpoint,
    response_types_supported: ['code'],
    ...(session.tokenEndpointAuthMethodsSupported
      ? { token_endpoint_auth_methods_supported: session.tokenEndpointAuthMethodsSupported }
      : {}),
  }
}

/**
 * A refresh failure's message comes from the authorization server's own
 * response (`parseErrorResponse` in the SDK) — normally a short
 * `invalid_grant`-style code, but its fallback branch embeds the ENTIRE raw
 * response body verbatim (e.g. an nginx 502 page) with no length limit.
 * Clamp before it reaches a user-facing error, and strip the refresh token on
 * the outside chance a misbehaving/compromised server reflected it back.
 */
function clampServerMessage(message: string, refreshToken: string): string {
  const redacted = refreshToken ? message.split(refreshToken).join('[redacted]') : message
  return redacted.length > 200 ? `${redacted.slice(0, 200)}…` : redacted
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
      metadata: refreshMetadata(session, tokenEndpoint),
      clientInformation: session.client,
      refreshToken,
      // RFC 8707: the auth server may require the exact resource it granted
      // originally to be re-asserted on every refresh, or reject with
      // invalid_target.
      ...(session.resource ? { resource: new URL(session.resource) } : {}),
    })
    await writeSession(client, {
      ...session,
      // a refresh response may omit refresh_token, which means "keep the old one"
      tokens: { ...tokens, refresh_token: tokens.refresh_token ?? refreshToken },
      expiresAt: stamp(tokens),
    })
    return tokens.access_token
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    // Final branch review finding (2026-07-29): this used to sign the client
    // OUT on ANY error out of refreshAuthorization — a transport error, DNS
    // failure or 502 destroyed the stored session exactly like a genuine
    // grant rejection would. This path runs on every client-page mount (via
    // clientTokenOverlay → clients.workspace.status), so an offline laptop
    // with an access token past the refresh margin would permanently delete
    // a perfectly good session. Same hazard genudoServerFor already treats as
    // worth guarding against (checks httpOk before touching any credential so
    // a doomed lookup can't destroy a session on its way to being thrown
    // away) — it survived here on the hotter path.
    //
    // Only an OAuth-level grant rejection means the session is actually
    // dead — the same three error classes the SDK's own `auth()` treats as
    // "recoverable by invalidating credentials and retrying" (see
    // client/auth.js): InvalidClientError/UnauthorizedClientError (the
    // client registration itself was rejected) and InvalidGrantError (the
    // refresh token is invalid/expired/revoked). Everything else —
    // fetch() throwing outright (no network, DNS failure), or a 502/maintenance
    // page that parseErrorResponse can't parse as a standard OAuth error body
    // (falls back to a generic ServerError, ALSO an OAuthError subclass but
    // NOT proof of a dead grant) — must not delete the session.
    const isDeadGrant =
      e instanceof InvalidClientError ||
      e instanceof UnauthorizedClientError ||
      e instanceof InvalidGrantError
    if (!isDeadGrant) {
      throw new Error(
        `Genudo session for ${client} could not be refreshed right now (${clampServerMessage(detail, refreshToken)}) — try again`,
      )
    }
    await genudoSignOut(client)
    throw new Error(
      `Genudo session for ${client} could not be renewed (${clampServerMessage(detail, refreshToken)}) — sign in again on the client page`,
    )
  }
}

const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/** The `error` query param lands in the loopback page's HTML verbatim — it is
 * server/redirect controlled, so escape it (reflected XSS on the loopback
 * origin otherwise). */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => HTML_ESCAPES[c] ?? c)
}

/**
 * One-shot loopback listener: resolves with the `code` the browser is
 * redirected to. `close()` tears the listener and timer down and is
 * idempotent — every settle/fail path below (`got`/`error` query param,
 * listen-error, timeout) routes through it via `code.then(close, close)`, so
 * a caller that exits BEFORE any of those ever fire (genudoSignIn throwing
 * early, or `auth()` returning AUTHORIZED without a redirect at all) is the
 * only remaining case, and can still guarantee the port comes free by
 * calling `close()` itself in a `finally`.
 */
export function awaitCallback(timeoutMs = 300_000): { url: string; code: Promise<string>; close: () => void } {
  let settle: ((code: string) => void) | null = null
  let fail: ((e: Error) => void) | null = null
  const code = new Promise<string>((resolve, reject) => {
    settle = resolve
    fail = reject
  })
  const server = createServer((req, res) => {
    const url = new URL(req.url ?? '/', REDIRECT_URI)
    if (url.pathname !== '/callback') {
      // a stray favicon/probe request mid-sign-in must not settle (or fail)
      // the listener — only the actual redirect path counts
      res.writeHead(404)
      res.end()
      return
    }
    const got = url.searchParams.get('code')
    const error = url.searchParams.get('error')
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' })
    res.end(
      `<body style="font:14px system-ui;padding:3rem">${
        got
          ? 'Signed in to Genudo. You can close this tab.'
          : `Sign-in failed: ${escapeHtml(error ?? 'no code')}`
      }</body>`,
    )
    if (got) settle?.(got)
    else fail?.(new Error(`Genudo sign-in was refused (${error ?? 'no authorization code'})`))
  })
  server.on('error', (e) => {
    fail?.(
      new Error(`could not listen on ${REDIRECT_URI} (${e.message}) — close whatever holds that port`),
    )
  })
  server.listen(CALLBACK_PORT, '127.0.0.1')
  const timer = setTimeout(() => {
    fail?.(new Error('Genudo sign-in timed out — no response from the browser'))
  }, timeoutMs)
  let closed = false
  const close = (): void => {
    if (closed) return
    closed = true
    clearTimeout(timer)
    server.close()
  }
  code.then(close, close)
  return { url: REDIRECT_URI, code, close }
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
      stored = {
        ...stored,
        tokens,
        expiresAt: stamp(tokens),
        account: accountFromIdToken(tokens.id_token) ?? stored.account,
      }
    },
    redirectToAuthorization: async (authorizationUrl: URL) => {
      await shell.openExternal(authorizationUrl.toString())
    },
    saveCodeVerifier: (v: string) => {
      verifier = v
    },
    codeVerifier: () => verifier,
  }

  // `awaitCallback` closes itself on every path that settles `code`, but
  // `auth()` returning AUTHORIZED on the first call (a silent refresh — the
  // common re-sign-in case) or throwing before the callback ever arrives
  // never touch `code` at all, so the listener needs an owner here too.
  try {
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
    const { authorizationServerUrl, authorizationServerMetadata, resourceMetadata } =
      await discoverOAuthServerInfo(mcpUrl)
    // Same resource the SDK's own `auth()` would have sent (RFC 8707) — persist
    // it so a later manual refresh (genudoAccessToken) can re-assert it too;
    // an auth server that enforces resource indicators rejects a refresh that
    // omits one with invalid_target.
    const resource = await selectResourceURL(mcpUrl, provider, resourceMetadata)
    await writeSession(client, {
      ...stored,
      tokenEndpoint: authorizationServerMetadata?.token_endpoint,
      authorizationServerUrl,
      tokenEndpointAuthMethodsSupported: authorizationServerMetadata?.token_endpoint_auth_methods_supported,
      resource: resource?.href,
    })
    return { account: stored.account ?? null }
  } finally {
    callback.close()
  }
}
