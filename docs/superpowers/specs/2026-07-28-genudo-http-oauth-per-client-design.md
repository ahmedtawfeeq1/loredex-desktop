# Genudo over Streamable HTTP, with per-client sign-in — design

**Date:** 2026-07-28 · **Status:** approved; step 0 (bridge pin) shipped, rest in planning

> Grounded in two upstream handovers — `genudo_mcp/docs/handover-streamable-http-oauth-migration.md`
> and this repo's `docs/handover/genudo-streamable-http-oauth.md` — plus direct
> inspection of this machine's npx cache and installed plugins. Facts below were
> read or probed, not assumed. Where this design departs from the upstream
> recommendation, the departure is called out and justified.

## Problem

Genudo's backend retired its SSE transport. `GET {BASE}/api/user/mcp/sse` returns
404 on production and staging. Every per-client `genudo` connection in this app is
a stdio spawn of the npm bridge:

```yaml
# projects/<client>/workspace.yml — today, all 59 clients
mcp:
  genudo:
    command: npx
    args: [-y, genudo-mcp-client]
    env:
      GENUDO_TOKEN: "${GENUDO_TOKEN_<CLIENT>}"
      GENUDO_BASE_URL: "https://api.genudo.ai"
```

The spec string is unpinned, and **npx caches by spec string**. This machine's cache
holds `genudo-mcp-client` at 1.1.0, 2.3.1 and 2.3.2 — all SSE-era, all dead against
the live backend. So the connection is broken here now, and on any machine that ran
the bridge before 2026-07-28, while a clean machine silently resolves the working
2.5.0. The failure surfaces as a pull that times out or errors on connect, with
nothing pointing at a stale cache.

Two other things changed at the same time:

- The backend now speaks **Streamable HTTP** — one `POST {BASE}/mcp` per message,
  stateless, no handshake required — and accepts **OAuth 2.1** alongside the Bearer
  token it always took.
- The Claude plugin `genudo` now **bundles its own hosted connector** and does its
  own OAuth. Claude's OAuth store is not per-project, so 59 client directories
  enabling that plugin would share one login. `genudo-no-connector` (v2.0.0, 22
  skills + 6 agents) is the same content without the connector.

## Goals

1. Every per-client Genudo connection works again, on stale machines included.
2. **Signing in is the default way a client's connection gets its credential**, for
   existing clients as much as new ones. Sign-in happens on demand, when the user
   picks up work for that client — not as a 59-consent migration.
3. No hand-editing of 59 `workspace.yml` files.
4. Codex ACP sessions keep working whether or not the adapter supports remote MCP.
5. No client can ever authenticate as another client's Genudo account.

## Decisions

### D1 — The per-client server becomes remote HTTP

```jsonc
{ "type": "http",
  "url": "https://api.genudo.ai/mcp",
  "headers": { "Authorization": "Bearer <client credential>" } }
```

This is the exact shape `oldPlatformServer()` already returns (`old-platform.ts:62`).
It deletes, for this connection: the npx spawn, the Node runtime dependency,
`widenNodePath()`, `withResolvedNpx()`, the Windows `cmd /c` CVE-2024-27980
workaround, npx cache staleness, and bridge cold-start latency on every pull.

### D2 — It is declared in `workspace.yml`, not injected

`old-platform.ts` is injected from the keychain specifically because
`workspaceSchema` models stdio only (`loredex/src/core/workspace.ts:19`, `command`
is required). That comment reads as a known limitation, and there are now two
remote servers hitting it. So the schema gets a discriminated union:

```yaml
mcp:
  genudo:
    type: http
    url: https://api.genudo.ai/mcp
    headers:
      Authorization: "Bearer ${GENUDO_TOKEN_2ME}"
```

**The `${VAR}` ref stays.** That is the pivot of this whole design:
`materializeWorkspace` already expands `${VAR}` from an env overlay the desktop
passes in, so `client-tokens.ts`, `clientEnvRefs()`, the missing-token diff, the
health probe and Add-Client's paste field all keep working with no change. The
credential slot is unchanged; only what fills it and how it travels are new.

`old-platform.ts` is **not** refactored onto this schema in this pass. It works, and
folding it in is unrelated scope.

### D3 — Sign-in fills that slot; tokens remain a fallback

Upstream (`docs/handover/genudo-streamable-http-oauth.md` §6) recommends *against*
OAuth: a fleet tool pulling across many client accounts wants headless credentials,
not a browser consent per client. That objection is answered rather than dismissed:

- The user signs in to a client when they pick it up, which is when a browser is
  already in front of them. Consent is not a 59-item migration.
- OAuth is only a **credential source for an existing slot**. A pasted token in the
  same slot still works, so a disappointing refresh lifetime, a revoked grant, or a
  self-hosted `GENUDO_BASE_URL` deployment costs nothing to fall back from.
- The token-rotation chore this replaces is real and currently outstanding.

So: sign-in is the default and the prominent control; "Use a token instead" stays
behind a disclosure for self-hosted and CI.

### D4 — The bridge leaves the codebase entirely

`acp.ts:575` pushes remote servers only under
`init.agentCapabilities?.mcpCapabilities?.http === true`, so the open question was
whether a Codex session would silently lose Genudo.

**Resolved by reading the installed adapter.** `@agentclientprotocol/codex-acp@1.1.4`
advertises `mcpCapabilities: { acp: false, http: true, sse: false }` — http is not
merely supported, it is Codex's *only* remote transport, so it cannot be decorative.
The Claude adapter advertises `{http, sse}`. Both shipped adapters satisfy `httpOk`.

Therefore there is no stdio fallback: a remote entry under `httpOk`, and omission
otherwise — exactly how `old-platform.ts` already behaves. Once the pull is direct
HTTP (D1) and every client is migrated, **no code path spawns `genudo-mcp-client`**,
and `GENUDO_BRIDGE_VERSION` is deleted with the last spawn site.

Until the fleet migration runs, an unmigrated client's health probe still spawns
whatever its `workspace.yml` declares — which is why the pin shipped first and stays
until the migration lands.

### D5 — `genudo-no-connector` replaces `genudo` at every scope

Not a workspace.yml string swap. `renderClaudeSettings` (`workspace.ts`) only ever
*adds* keys — `enabledPlugins[plugin] = true` — so a stale `"genudo@genudo-ai": true`
survives regeneration in all 59 `.claude/settings.json` and re-registers a bundled
connector that authenticates as whichever account Claude last signed in to. The
migration prunes the key, and the plugin is uninstalled at every scope it occupies.

This machine's actual state, which the migration must tolerate:

| Entry | Scope | Version |
|---|---|---|
| `genudo@genudo-ai` | user | 1.1.2 |
| `genudo@genudo-ai` | project (`clients_work/projects/arabicss`) | 1.1.2 |
| `genudo-desktop@genudo-ai` | user | 1.1.2 |

All three stale against 2.0.0. `genudo-desktop` cannot be updated in place — the id
no longer exists in the marketplace — so it is uninstall + install.

## Architecture

### Credential store

One keychain entry per client holds the **session**, a JSON blob under
`clients/<slug>/GENUDO_OAUTH`:

```jsonc
{ "access_token": "…", "refresh_token": "…", "expires_at": 1780000000,
  "client_id": "…", "account": "acme@example.com" }
```

The **access token is mirrored into the existing `${GENUDO_TOKEN_<CLIENT>}` slot**
on every refresh, via the same `storeClientToken()` path a pasted token uses. Every
downstream consumer therefore stays ref-shaped and unaware of which source filled it.

`client-tokens.ts` needs no new primitives — the session blob is one more
keychain/encrypted-map entry through `keychainSet` / `readEncMap`.

### Sign-in flow

Driven by `@modelcontextprotocol/sdk/client/auth.js` (already a dependency) with an
`OAuthClientProvider` implementation backed by the keychain. The SDK handles dynamic
client registration, PKCE `S256`, code exchange and refresh; discovery is automatic
from the `WWW-Authenticate` header on a 401.

- Consent opens in the **system browser** (`shell.openExternal`), so an existing
  Genudo web session is reused.
- Redirect target is a loopback listener on `127.0.0.1`, bound to an ephemeral port
  for the duration of one sign-in and closed immediately after.
- Scope is `mcp:use`. `mcp:access` no longer exists anywhere, including staging.
- Only presence and account label cross the IPC seam. The tokens never reach the
  renderer.

### Refresh-on-touch

Access tokens expire, and the materialized `.mcp.json` an external Claude Code reads
is a snapshot. There is no background timer. Instead, every hand-off refreshes first:

| Trigger | Action |
|---|---|
| Client page opened | refresh if expiring within 60s, re-materialize `.mcp.json` |
| Open in Terminal | same, before spawning |
| `clients.pull` | same, before the first POST |
| `clients.connections.test` | same |
| ACP session start | same, before building the server list |
| Any 401 from Genudo | refresh once, retry once, then surface "Sign in again" |

A client with no session and no pasted token fails with an actionable *"Not signed
in to Genudo — sign in on the client page"*, never a bare 401.

### Consumers

Four, one credential:

1. **`.mcp.json` materialize** — header expanded from the freshly-minted token.
2. **ACP / Chat Here** (`acp.ts`) — `{type:'http', name:'genudo', url, headers}` when
   `httpOk`, pinned stdio otherwise.
3. **`clients.pull`** (`genudo-pull.ts:291` `fetchBundles`) — the stdio spawn is
   replaced by a plain `fetch` POST loop against `{BASE}/mcp`. No `initialize`
   handshake is required (the server is stateless and answers `tools/list` as a first
   request), but one is sent anyway for protocol hygiene, tolerating a `204` with an
   empty body. `Accept: application/json, text/event-stream`, and any
   `Mcp-Session-Id` response header is echoed on subsequent requests — roughly ten
   lines of insurance against a server-side change Genudo does not make today.
4. **`clients.connections.test`** — `probeHttpTools` (`mcp-tools.ts`) already does
   `initialize` + `tools/list` and never `ping`, which the backend rejects with
   `-32601`. It is reused as-is.

### Guidance that direct connection loses

Going direct drops four bridge-synthesised things: ~4,600 chars of server
instructions, three prompts, the two bridge-local tools `get_instruction_guides` and
`get_editing_playbook`, and response slimming (`list_pipelines` returns 27 KB raw).

**Audited:** `staged-edits.ts` and `StagedEditsView.tsx` are pure filesystem readers
— they scan `instructions-updates/` and `pipelines/<unit>/versions/` and make no MCP
call — so this app's staged-edit view is unaffected. The dependency is the *agent*
that produces those folders, which calls `get_editing_playbook` for the safe
load → mirror → stage → diff → confirm → push procedure. `genudo-no-connector` v2.0.0
ships that text as the `editing-playbook` and `instruction-guides` skills, so a
session with the plugin keeps the procedure and its confirmation step.

Response slimming is not replaced. The pull *wants* full text — it currently passes
`verbose: true` for exactly that reason, and that argument becomes a harmless no-op
against the backend. For agent sessions, unslimmed responses are a context cost, not
a correctness problem.

## Component changes

| File | Change |
|---|---|
| `loredex/src/core/workspace.ts:18-27` | `mcpServerSchema` → discriminated union: stdio (`command`) \| remote (`type: 'http'`, `url`, optional `headers`). Reject a block carrying both. |
| `loredex/src/core/workspace.ts` `renderMcpJson` | emit the remote shape; `${VAR}` expansion applies to `headers` values as it does to `env` |
| `loredex` — new command | `agent-ops migrate-genudo-http [--check]` |
| `src/core/genudo-pull.ts:291-373` | `fetchBundles` → `fetch` POST loop; drop `StdioClientTransport`, `widenNodePath`, `withResolvedNpx` from this path |
| `src/core/genudo-pull.ts:313-314` | pin `genudo-mcp-client@2.5.0`. **Ships first, standalone** — it un-breaks stale-cache machines before anything else here lands. Once the pull is direct HTTP, the pinned spawn survives only as the Codex ACP fallback (D4). |
| `src/core/genudo-auth.ts` — new | `OAuthClientProvider`, loopback listener, `signIn` / `signOut` / `status` / `freshToken(client)` |
| `src/core/client-tokens.ts` | no new primitives; session blob rides the existing entries |
| `src/core/acp.ts:574-578` | genudo http under `httpOk`, pinned stdio otherwise |
| `src/core/claude-plugins.ts` | `GENUDO_PLUGIN = 'genudo-no-connector'`; install command; update check |
| `src/core/handlers.ts:430-460` | pull/probe call `freshToken()` first; actionable not-signed-in error |
| `src/shared/ipc-contract.ts` | `clients.genudo.signIn` / `.signOut` / `.status` |
| `src/renderer/.../ClientPage.tsx` | Connection card |

### Plugin installer and update check

Install follows the existing n8n/langsmith shape, including the two-step trap
already documented at `claude-plugins.ts:23-27`:

```ts
export const GENUDO_PLUGIN = 'genudo-no-connector'

export const GENUDO_PLUGIN_COMMAND = [
  '/plugin marketplace add genudo-ai/claude-plugin',
  RELOAD_PLUGINS_COMMAND,
  '/plugin install genudo-no-connector@genudo-ai',
  RELOAD_PLUGINS_COMMAND,
].join('\n')
```

The marketplace **name** is `genudo-ai`; the repo path `genudo-ai/claude-plugin` is
parsed as `<plugin>@<marketplace>` and fails with *Marketplace not found*. Adding
`genudo-ai/claude-plugin` also **replaces** a same-named marketplace, after which an
installed plugin reports "already installed" and keeps the stale copy — so the
migration uninstalls before installing rather than re-adding. `claude plugin details`
reports "MCP servers (0)" regardless and cannot be used to verify; `claude mcp list`
can.

Update detection needs no CLI call: `~/.claude/plugins/installed_plugins.json` maps
`<plugin>@<marketplace>` to an **array** of installs, one per scope, each with its own
`version` — reading `[0]` misses the others, and the per-client model produces
multi-scope installs routinely. Compare each against the public mirror's
`plugin.json` (unauthenticated raw fetch, `2.0.0` today). Applying an update uses the
non-interactive `claude plugin marketplace update genudo-ai` + `claude plugin update
<plugin>`, except across the `genudo-desktop` rename, which is uninstall + install.

## UI

One **Connection** card on the client page:

| State | Shows | Controls |
|---|---|---|
| No credential | "Not connected to Genudo" | **Sign in to Genudo** |
| Signed in | account label, "Renews automatically" | **Test** · **Sign out** |
| Refresh failed / revoked | reason | **Sign in again** |
| Pasted token | "Connected with a token" | **Test** · **Sign in instead** |

Full-size `Button`s with capitalized labels — never tiny lowercase links. "Use a
token instead" is a disclosure under the sign-in button. Add-Client keeps its paste
field but leads with sign-in after creation.

## Migration

One command, `--check` first, never hand-edited files:

```
loredex agent-ops migrate-genudo-http [--check] [--client <slug>]
```

Per client: rewrite the `genudo` mcp block stdio → http, keeping the existing
`${GENUDO_TOKEN_*}` ref in `headers.Authorization`; swap `plugins.claude` from
`genudo@genudo-ai` to `genudo-no-connector@genudo-ai`; prune the stale
`genudo@genudo-ai` key from `.claude/settings.json`; re-materialize. `--check` prints
the diff and writes nothing. Idempotent on an already-migrated client.

Clients whose pasted token is still valid keep working the moment this lands, before
anyone signs in. Sign-in then happens per client, on demand.

Machine-level, once, outside the vault: `claude plugin uninstall genudo@genudo-ai`
(user and project scope), `claude plugin uninstall genudo-desktop@genudo-ai`,
`claude plugin install genudo-no-connector@genudo-ai`. `rm -rf ~/.npm/_npx` clears
the poisoned bridge cache.

## Testing

- `workspaceSchema` accepts the remote shape, rejects a block with both `command`
  and `url`, and still accepts every stdio block in the fleet.
- `renderMcpJson` emits the remote shape, preserves foreign servers, and expands
  `${VAR}` inside `headers`.
- OAuth provider round-trip against a fake token endpoint: first sign-in, refresh
  near expiry, 401 → refresh → retry once, refresh failure → "sign in again" state.
- `freshToken()` prefers a live session, falls back to a pasted token, and throws an
  actionable error when neither exists.
- `fetchBundles` over a stubbed HTTP server: `tools/list` as a first request,
  a `204` empty body on `notifications/initialized`, an echoed `Mcp-Session-Id`, and
  a `text/event-stream` response body.
- ACP server list: http entry when `httpOk`, pinned stdio when not.
- Migration `--check` produces the expected diff on a fixture client, writes nothing,
  and is idempotent on an already-migrated one.
- Plugin update check reads **every** scope in the `installed_plugins.json` array.

## Risks, inherited not re-derived

1. ~~**Production OAuth consent has never been clicked through.**~~ **Cleared
   2026-07-28** — the production consent flow was completed by hand and works.
   Upstream's staging-only caveat no longer applies to this design.
2. **Access and refresh token lifetimes are unstated.** Refresh-on-touch covers a
   short access token; a short *refresh* token would mean re-consenting often, which
   the token fallback absorbs.
3. **The backend may truncate long fields.** Upstream lists server-side slimming as
   an open request, implying raw responses are complete — but the pull mirrors
   configuration into the vault, so a silent truncation would be written as if real.
   Diff one `list_pipelines` bridge-vs-direct before trusting the new pull.
4. ~~**Codex's `mcpCapabilities.http` is unverified.**~~ **Cleared 2026-07-28** —
   `@agentclientprotocol/codex-acp@1.1.4` advertises `{acp: false, http: true,
   sse: false}`. No stdio fallback is built. If a future adapter advertises no http,
   Genudo is omitted from that session rather than silently half-working.
5. **`mcp:access` is gone.** Any staging token minted with that scope must be
   re-minted as `mcp:use`; it surfaces as a 401.

## Out of scope

- Refactoring `old-platform.ts` onto the new schema.
- Emitting Codex-shaped config (`{url, auth}` rather than `{type:'http'}`) — needed
  only if this app generates Codex config files, which it does not today.
- Replacing bridge-side response slimming.
