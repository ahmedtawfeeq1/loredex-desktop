---
project: loredex-desktop
topic: genudo-streamable-http-oauth
type: analysis
date: 2026-07-28
source: claude-code
tags: [handover, genudo, mcp, streamable-http, oauth, acp, codex, per-client, breaking-change]
---

# Genudo connector changed — what loredex-desktop needs to update

**From:** genudo_mcp (connector `v2.5.0`, plugins `v2.0.0`, shipped 2026-07-28)
**Objective:** update the per-client Genudo wiring, the no-connector plugin, and the
Codex ACP path to match the new connection model.

Grounded in this repo at `f1f76aa` — every file:line below was read, not guessed.

---

## 0. The one-line version

Genudo's backend dropped SSE for **Streamable HTTP** and added **OAuth**. Your stdio
spawn of `genudo-mcp-client` still works *if the version is fresh*, but the new platform
can now be a **remote HTTP server with a Bearer header** — the exact shape
`old-platform.ts` already returns — which deletes the whole npx/Node/Windows spawn
problem for the per-client `genudo` connection.

---

## 1. URGENT — the unpinned spawn can silently break

`src/core/genudo-pull.ts:313-314`

```ts
process.platform === 'win32'
  ? { command: 'cmd', args: ['/c', 'npx', '-y', 'genudo-mcp-client'] }
  : { command: 'npx', args: ['-y', 'genudo-mcp-client'] },
```

Unpinned resolves to `latest`, which is now `2.5.0`, so a clean machine is fine. **But
npx caches by spec string.** Any machine that ran this before 2026-07-28 can still serve
a cached `2.4.0`, and 2.4.0 talks to `GET {BASE}/api/user/mcp/sse` — which now returns
**404 on production**. The failure is a pull that times out or errors on connect, with
nothing pointing at a stale cache.

**Do:** pin the version.

```ts
{ command: 'npx', args: ['-y', 'genudo-mcp-client@2.5.0'] }
```

**Remediation for an already-poisoned machine:** `rm -rf ~/.npm/_npx`.

Also note `GENUDO_MAX_RECONNECTS` was removed from the bridge (it guarded an SSE
reconnect storm). Passing it is harmless — it is ignored. Every other env var you set is
unchanged: `GENUDO_TOKEN`, `GENUDO_BASE_URL`, `GENUDO_ALLOW_INSECURE_SSL`,
`GENUDO_REQUEST_TIMEOUT`, `GENUDO_REQUEST_RETRIES`, `GENUDO_WORKDIR`.

---

## 2. The new platform can now be a remote HTTP server — you already have the pattern

`old-platform.ts` documents the constraint precisely:

> `workspace.yml`'s schema (loredex lib `workspaceSchema`) models **stdio** servers only —
> `command` / `args` / `env`. The old platform is remote HTTP with an
> `Authorization: Bearer` header, which the schema cannot express, so the keychain is its
> home and this module is what hands it out.

That constraint now applies to the **new** platform too, and the escape hatch is the one
you already built. `oldPlatformServer()` returns exactly the right shape:

```ts
{ type: 'http', name, url, headers: [{ name: 'Authorization', value: `Bearer ${token}` }] }
```

For the new platform that becomes:

```ts
{ type: 'http',
  name: 'genudo',
  url: 'https://api.genudo.ai/mcp',       // {BASE}/mcp — self-hosted: https://<host>/mcp
  headers: [{ name: 'Authorization', value: `Bearer ${clientToken}` }] }
```

**What this buys you** — all of it disappears for the `genudo` connection:

- the `npx` spawn and the Node runtime dependency
- `widenNodePath()` (nvm/homebrew/per-user installer PATH surgery)
- `withResolvedNpx()` and the Windows `cmd /c` CVE-2024-27980 workaround
- npx cache staleness (§1 stops being possible)
- bridge cold-start latency on every pull

Two consumers, same as the old platform: sessions this app spawns (Chat Here / ACP), and
`syncOldPlatformMcp`'s sibling — mirror the http entry into the client's generated
`.mcp.json` so external Claude Code sees it. An http entry with a `headers` map is
cleaner than expanding `GENUDO_TOKEN` into an npx command's `env`.

**Decide first:** extend `workspaceSchema` to express http servers (fixes this class of
problem for good), or inject the new platform via keychain exactly like the old one
(smaller, consistent with what ships today). Given the schema comment reads as a known
limitation rather than a deliberate choice, extending it is probably the better trade —
but that is your call, not ours.

---

## 3. What you lose going direct — read before you delete the bridge

The bridge is not a dumb pipe. Four things are synthesised **client-side** and vanish on
a direct HTTP connection:

1. **Server instructions** — ~4,600 chars of tool-ordering guidance injected into
   `initialize`. The backend returns none.
2. **Prompts** — `edit_instructions`, `build_pipeline`, `audit_pipeline`. No `prompts`
   capability on the backend.
3. **`get_instruction_guides` and `get_editing_playbook`** — **bridge-local tools, not
   backend tools.** They will not appear.
4. **Response slimming** — `list_pipelines` returns **27 KB** unslimmed (full personas and
   instruction texts). The bridge truncates and offers `verbose: true`.

`tools/list` returns **29** direct, **31** through the bridge.

⚠️ **Check `staged-edits.ts` / `StagedEditsView.tsx` before switching.** Item 3 is the
safe *load → mirror → stage → diff → confirm → push* workflow for editing a live agent's
instructions. If your staged-edit flow leans on `get_editing_playbook` being callable,
a direct connection removes the procedure and the confirmation step from under it.

**Mitigation:** Genudo plugin v2.0.0 ships that same text as two plugin skills —
`instruction-guides` and `editing-playbook` — precisely so the guidance no longer depends
on which connector is attached. If a session has the plugin, direct is safe. If it does
not, keep the bridge or carry the guidance yourself.

These four are an open ask to the Genudo backend team; if they land server-side this
section goes away.

---

## 4. Plugin ids and marketplace changed

Relevant to `claude-plugins.ts` if you ever auto-install or detect Genudo plugins (today
it only mentions `/genudo:*` in a comment at line 161).

| Was | Now |
|---|---|
| marketplace `genudo-ai/genudo_mcp` | **`genudo-ai/claude-plugin`** (public mirror) |
| plugin `genudo-desktop` | **`genudo-no-connector`** |
| `genudo` — connector via `npx` + `userConfig.token` | `genudo` — `{"type":"http","url":"https://api.genudo.ai/mcp"}`, **no config prompt** |

The marketplace *name* is still `genudo-ai` in both repos, so the install string stays
`genudo@genudo-ai`. The old marketplace still resolves — existing installs keep working.

**Two gotchas that will bite your automation**, both hit during the release:

- Adding `genudo-ai/claude-plugin` **replaces** a previously-added `genudo-ai` marketplace
  of the same name. An already-installed plugin then reports *"already installed"* and
  **keeps the stale copy** — with no connector registered. Uninstall + reinstall is
  required; a re-add is not enough.
- `claude plugin details` reports **"MCP servers (0)"** for inline *and* file-based
  entries — it simply does not count them. Verify with `claude mcp list`, which shows
  `plugin:genudo:genudo: https://api.genudo.ai/mcp (HTTP) - ! Needs authentication`.

Your existing "BETWEEN add and install" caveat (`claude-plugins.ts:23-27`) still applies
unchanged.

**`genudo-no-connector` is the plugin you want** for the per-client model: identical 22
skills and 6 agents, no bundled MCP server, so it never collides with the per-client
`genudo` connection you inject. That is exactly the case it was renamed for — it used to
be called "desktop" only because Claude Desktop's plugin upload could not collect a token.

### 4a. Install — follow your own n8n/langsmith pattern

Genudo slots straight into the existing shape in `claude-plugins.ts`:

```ts
export const GENUDO_PLUGIN = 'genudo-no-connector'   // or 'genudo' for the bundled connector

export const GENUDO_PLUGIN_COMMAND = [
  '/plugin marketplace add genudo-ai/claude-plugin',
  RELOAD_PLUGINS_COMMAND,
  '/plugin install genudo-no-connector@genudo-ai',
  RELOAD_PLUGINS_COMMAND,
].join('\n')
```

⚠️ **The exact trap you already documented for n8n applies here.** The marketplace *name*
is **`genudo-ai`** (from the repo's `.claude-plugin/marketplace.json`), **not** the GitHub
path `genudo-ai/claude-plugin`. `/plugin install genudo-ai/claude-plugin` is parsed as
`<plugin>@<marketplace>` and fails with *Marketplace not found*. Add the repo first,
install by marketplace name second — same two-step, same `RELOAD_PLUGINS_COMMAND` between
add and install for the "BETWEEN add and install" bug at `claude-plugins.ts:23-27`.

`hasPluginInstalled()` works unchanged — keys are `<plugin>@<marketplace>`, so
`hasPluginInstalled('genudo-no-connector')` is the check. **Update the name you pass:**
`hasPluginInstalled('genudo-desktop')` is now permanently `false` for fresh installs.

### 4b. Check for updates — you have no update path today

`grep "marketplace update"` in `claude-plugins.ts` returns nothing: plugins are installed
once and never refreshed. Genudo plugins will now move (2.0.0 today), so this matters.

**Installed version is already on disk.** `~/.claude/plugins/installed_plugins.json`
entries carry more than you currently read:

```jsonc
"genudo@genudo-ai": [
  { "scope": "user",                     // or "project" + "projectPath"
    "version": "1.1.2",
    "installPath": "…/cache/genudo-ai/genudo/1.1.2",
    "installedAt": "…", "lastUpdated": "…",
    "gitCommitSha": "86c2916…" }
]
```

Note the array — the **same plugin can be installed at several scopes at once**, each with
its own version. Your per-client model produces exactly that: this machine currently has
`genudo@genudo-ai` at both `scope: "user"` and `scope: "project"` for
`clients_work/projects/arabicss`. An update check that reads `[0]` will silently miss the
others.

**Latest version is one unauthenticated fetch** — the mirror is public:

```
https://raw.githubusercontent.com/genudo-ai/claude-plugin/main/genudo-plugin/.claude-plugin/plugin.json
https://raw.githubusercontent.com/genudo-ai/claude-plugin/main/genudo-plugin-no-connector/.claude-plugin/plugin.json
```

Both report `"version": "2.0.0"` today. Compare against the installed `version` per scope
→ that is your "update available" badge, no CLI invocation and no session needed.

**Applying an update** — both commands exist and are non-interactive (unlike
`/plugin install`, which is a TUI slash command):

```bash
claude plugin marketplace update genudo-ai   # refresh the marketplace from source
claude plugin update <plugin>                # update a plugin to the latest version
```

`claude plugin marketplace update` with no name updates all of them.

⚠️ **`claude plugin update` will not carry `genudo-desktop` across the rename** — the id no
longer exists in the marketplace. That path needs uninstall + install:

```bash
claude plugin uninstall genudo-desktop@genudo-ai
claude plugin install genudo-no-connector@genudo-ai
```

**This machine is a live example:** `genudo-desktop@genudo-ai` is still installed at
`1.1.2` (user scope), and `genudo@genudo-ai` at `1.1.2` in both user and project scope —
all three stale against 2.0.0, and the `genudo-desktop` one now un-updatable in place.
Whatever migration you write will need to handle exactly this state on real machines.

---

## 5. Codex ACP

`acp.ts:535` gates remote servers on the adapter advertising http:

```ts
const httpOk = init.agentCapabilities?.mcpCapabilities?.http === true
```

Two consequences:

1. **If the Codex adapter does not advertise `http`, the new remote `genudo` gets
   dropped** — same as the old platform does today (`acp.ts:575`, pushed only under
   `httpOk`). For Codex, keep the **stdio bridge pinned at 2.5.0** as the fallback path.
   That is the strongest argument for not deleting the bridge wiring outright.
2. Your own note at `acp.ts:561-563` — the Claude adapter advertises `{http, sse}` with
   **no stdio** yet honours stdio anyway — is a warning that these capability flags are
   not reliable. **Verify Codex empirically** rather than trusting `mcpCapabilities`.

**Codex uses a different key shape.** For Codex's own config (not ACP injection), a
remote MCP server is:

```jsonc
{ "url": "https://api.genudo.ai/mcp", "auth": "oauth" }   // or bearer_token_env_var
```

`url` + `auth` — **not** Claude's `type: "http"`. If you generate config for Codex as
well as Claude, they need separate emitters. `codex mcp login <server>` drives the OAuth
flow. Genudo's ChatGPT/Codex plugin already ships this shape.

---

## 6. Auth — keep per-client tokens

OAuth 2.1 is live (DCR, PKCE S256, scope `mcp:use`, authorize at
`https://app.genudo.ai/oauth/authorize`). **We do not recommend it for your flow.** A
desktop app pulling across many client accounts wants headless per-client credentials,
not a browser consent dance per client. Your `client-tokens.ts` keychain model is the
right one and needs no change.

**One thing to check:** scope `mcp:access` **no longer exists** — it is `mcp:use`
everywhere now, on staging as well as production. Any client token minted with
`mcp:access` for staging must be re-minted. A wrong scope surfaces as `401`, with the
discovery pointer in the header:

```http
WWW-Authenticate: Bearer realm="Genudo MCP",
  resource_metadata="https://api.genudo.ai/.well-known/oauth-protected-resource"
```

---

## 7. Wire facts (probed live 2026-07-28, not assumed)

| Probe | Result | Implication |
|---|---|---|
| `GET {BASE}/api/user/mcp/sse` | **404** | old transport is gone, prod *and* staging |
| `initialize` | `200`, `application/json`, **no `Mcp-Session-Id`** | server is **stateless** |
| `tools/list` as first POST, no handshake | `200`, 29 tools | handshake is **optional** |
| `notifications/initialized` | `204`, empty body | handle an empty body |
| `ping` | `-32601 Method not found` | **do not use `ping` as a health check** |

`initialize` returns `protocolVersion 2024-11-05`, `capabilities {tools:{}}`,
`serverInfo {name: "Genudo Backend Console"}` — no `instructions`, no `prompts`.

Cheap insurance if you hand-roll the transport: accept `text/event-stream` as well as
`application/json`, and echo a `Mcp-Session-Id` if one ever appears. Genudo does neither
today; both are ~10 lines and prevent a future outage.

---

## 8. Suggested order

1. **Pin `genudo-mcp-client@2.5.0`** in `genudo-pull.ts` — unblocks any stale-cache
   machine. Ship this alone if nothing else.
2. Audit `staged-edits.ts` for a `get_editing_playbook` dependency (§3) — this decides
   whether step 3 is safe.
3. Move the per-client `genudo` server to `{type:'http', url, headers:[Bearer]}`, either
   by extending `workspaceSchema` or by mirroring the `old-platform.ts` injection. Mirror
   it into the client `.mcp.json` like `syncOldPlatformMcp` does.
4. Keep the pinned stdio bridge as the **Codex ACP fallback** until Codex's http support
   is verified empirically (§5).
5. Add Genudo to the plugin installer (§4a) — marketplace name `genudo-ai`, not the repo
   path — and switch any `hasPluginInstalled('genudo-desktop')` call to
   `'genudo-no-connector'`.
6. Build the update check (§4b): compare the per-scope `version` in
   `installed_plugins.json` against the mirror's `plugin.json`, and treat the
   `genudo-desktop` rename as uninstall + install rather than `claude plugin update`.

---

## 9. Reference

| | |
|---|---|
| Full migration report | `genudo_mcp/docs/handover-streamable-http-oauth-migration.md` |
| npm | `genudo-mcp-client@2.5.0` |
| Release | https://github.com/genudo-ai/genudo_mcp/releases/tag/v2.5.0 |
| PR | https://github.com/genudo-ai/genudo_mcp/pull/11 |
| Claude plugins | https://github.com/genudo-ai/claude-plugin |
| ChatGPT / Codex plugin | https://github.com/genudo-ai/chatgpt-plugin |

**Not yet verified on Genudo's side** — inherit these as risks, don't re-derive them:
production OAuth consent has never been clicked through (staging only), and the
ChatGPT/Codex plugin manifest follows OpenAI's documented format but has not been
installed in the app.
