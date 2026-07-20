# Workspace MCP servers & skills — design

**Date:** 2026-07-20 · **Status:** approved; spikes run, two decisions reversed

> **Revision 2** — three spikes were run before planning. They reversed the
> bundling decision and removed the two largest risks. Every number below is
> measured on this machine, not estimated. See *Spike results*.

## Problem

Loredex has exactly two kinds of MCP server today:

1. **loredex-mcp** — ours, an HTTP host we inject by URL into every ACP session.
2. **client servers** — declared in `projects/<client>/.mcp.json`, discovered by
   the adapter from its working directory.

There is no third category for a server that belongs to the *workspace* rather
than to one client. n8n is the motivating case: one n8n instance, one API key,
wanted in every session and in the terminal — not per client.

The same gap exists for **skills**. n8n ships 14 Claude Code skills plus a router,
and nothing in loredex knows they exist.

Finally, Settings › MCP server reports only *our* host's status. It never shows
which servers a session actually gets, nor what tools they expose.

## Scope

**In:**
- A **workspace server registry** — the third category, with n8n-mcp as its first
  member and loredex-mcp folded in as the second.
- n8n-mcp injected into every ACP session, **all three providers**.
- The n8n API key stored once in Settings (OS keychain), optional.
- Settings › MCP servers listing every workspace server with its **tools expanded
  by default**, read live.
- Terminal/skills setup driven by **button + exact command + Verify**, per the
  user's instruction: *"give me button to press to open the terminal and commands
  to paste until success."*
- The n8n **skills/plugin lane for Claude only.**

**Out (explicitly deferred):**
- Codex plugins/skills — the user deferred these. MCP tools still reach Codex.
- Gemini skills. Same.
- Any user-authored workspace server UI. The registry is code-defined this round;
  a "add your own server" form is a later, separate change.
- Auto-updating the installed n8n skills plugin.

## Architecture — three lanes

Each lane is defined by *who can honestly perform the action*.

### Lane 1 — MCP injection (loredex does it, no terminal)

ACP's `McpServer` union includes `McpServerStdio`:

```ts
{ name: string; command: string; args: string[]; env: EnvVariable[] }
```

`command` is documented as an absolute path to an executable, so n8n-mcp runs the
same way the ACP adapters already do: **`process.execPath` with
`ELECTRON_RUN_AS_NODE=1`, pointed at the package's resolved `dist` entry.**

**n8n-mcp is installed on demand, NOT bundled** (revised — see Spike 1).
Bundling was the original decision; measurement killed it: the package is
**105 MB installed**, of which `data/nodes.db` alone is **96 MB**. Current
installers are ~110–130 MB, so bundling would roughly double all seven release
assets, every release, for a feature not every user enables.

Instead, the first time n8n is enabled loredex installs it into its **own app-data
directory** (`<userData>/mcp/n8n-mcp/`, beside `app.db`, so it survives app
replacement), at a **pinned version**, and spawns the resolved entry directly:

- `npm install n8n-mcp@<pinned> --omit=optional --prefix <userData>/mcp/n8n-mcp`
- run `dist/mcp/stdio-wrapper.js` under `process.execPath` + `ELECTRON_RUN_AS_NODE=1`

`--omit=optional` is **required, not incidental**: n8n-mcp's only optional
dependency is `better-sqlite3`, a **native** module. A native build compiled for
one Node ABI does not load under Electron's — the exact class of failure this
project already hit with `better-sqlite3` going x86_64. Omitting it forces the
required pure-WASM `sql.js` path: no compiler on the user's machine, no ABI
coupling, no Windows build toolchain. Spike 3 proved it is also **faster**.

Because we spawn a resolved path under our own node, `npx` is never involved —
so the Windows `npx.cmd` / `cmd /c` problem (BL-24) does not arise here at all.

**Resolution gotcha (Spike 1):** n8n-mcp restricts its `exports` map, so
`require.resolve('n8n-mcp/package.json')` — the trick `adapterEntry` uses for the
ACP adapters — **throws**. Resolution must go through the main entry:
`join(dirname(require.resolve('n8n-mcp')), 'mcp/stdio-wrapper.js')`.

Its env, per the upstream docs: `MCP_MODE=stdio`, `LOG_LEVEL=error`,
`DISABLE_CONSOLE_OUTPUT=true` (all three required to keep debug output off stdout,
which is the ACP/MCP wire), plus `N8N_API_URL` and `N8N_API_KEY` when configured.

**Provider reach:** all three. This is protocol-level, not Claude-specific.

**Proven (Spike 2).** The Claude ACP adapter accepts an injected stdio server and
spawns it. Worth recording precisely because `initialize` advertises
`mcpCapabilities: {http: true, sse: true}` — **stdio is not advertised at all**,
yet `session/new` honoured it. So capability introspection would have given the
wrong answer in *both* directions; only the live test settled it. Implementation
must therefore **not** gate stdio injection on an advertised capability flag.

### Lane 2 — The API key (Settings, once)

Reuses `agent-keys.ts` verbatim in shape: OS keychain via `client-tokens`, an
in-memory cache, folded into *that server's* env at spawn. Invariants carried
over unchanged — the key never enters `process.env` (so the embedded pty never
inherits it), never the vault, never a commit, never a renderer payload, never a
log. Only presence crosses the seam.

**The key is optional.** Without it n8n-mcp still serves 7 documentation and
validation tools; with it, 17 more for creating, deploying and running workflows.
The UI states which set is active rather than treating "no key" as broken.

### Lane 3 — Skills & terminal (button + command + Verify)

`/plugin install` only runs inside a `claude` TUI session — loredex cannot invoke
it. So each item that needs the terminal gets a **setup card**:

- the exact command, copyable
- **Open terminal** — opens the in-app terminal at the vault root with the
  command pre-filled
- **Verify** — re-runs the check and flips the row green

The card stays red, with the command visible, until the check actually passes.
Nothing is reported as done on the strength of having *shown* the user a command.

**Checks (concrete, file-based):**

| Item | Check |
|---|---|
| n8n skills plugin | `~/.claude/plugins/installed_plugins.json` → any key matching `^n8n-mcp-skills@` |
| n8n MCP in terminal Claude | `claude mcp list` exit 0 and stdout contains `n8n-mcp` |

The plugin registry format is `{version, plugins: {"<plugin>@<marketplace>": [...]}}`,
verified on this machine. If a future Claude Code changes it, the check fails
closed — red with the command shown, never a false green.

**Commands:**

```
# skills (inside a claude session)
/plugin install czlonkowski/n8n-skills

# n8n MCP for terminal-run claude
claude mcp add n8n-mcp -e MCP_MODE=stdio -e LOG_LEVEL=error \
  -e DISABLE_CONSOLE_OUTPUT=true -e N8N_API_URL=<url> -e N8N_API_KEY=<key> \
  -- npx n8n-mcp
```

## The workspace server registry

A new `src/core/workspace-mcp.ts`, code-defined this round:

```ts
interface WorkspaceServer {
  id: 'loredex' | 'n8n'
  label: string
  /** null when this server needs no configuration to be useful */
  keyVar: string | null
  /** built at spawn; null = not configured / disabled → not injected */
  build(ctx): McpServer | null
}
```

`acp.ts` currently hardcodes the loredex server at session start. That becomes a
loop over enabled registry entries, with loredex as one row. This is the targeted
improvement the feature justifies — it removes a special case rather than adding
a second one beside it.

Enabled/disabled per server persists via `settings.ts` (the `meta` table), so it
survives reinstall like every other setting.

## Settings › MCP servers

The existing section grows an inventory below the host card:

- one row per workspace server: name, status dot, transport, config state
  ("documentation tools only" vs "full access" for n8n)
- **tools listed and expanded by default** — the explicit ask
- for a server needing setup, the Lane-3 card inline

**Tools are read live, never hardcoded**, so the list cannot drift from reality:
a new `mcp.tools` channel spawns the server, runs `initialize` + `tools/list`,
kills it, and returns the names. Bounded by the same 9s timeout the client
connection probe already uses, cached in memory for the session, with a spinner
while it runs. For loredex-mcp — already running in-process — it answers directly
with no spawn.

## Error handling

- **n8n-mcp fails to spawn** → that server is dropped from the session, the
  session still starts with the rest. Precedent: `acp.ts` already degrades this
  way rather than bricking a provider over one MCP server.
- **Key set but n8n unreachable** → surfaced on the settings row via the tools
  probe (which will return the 7 doc tools and no `n8n_*` ones). Not fatal.
- **Verify fails** → row stays red, command stays visible. No optimistic green.
- **Plugin registry unreadable/changed** → fails closed (red), never a false pass.

## Testing

- `workspace-mcp.test.ts` — registry builds the right `McpServer` per config
  state; a server with a required-but-missing key is omitted, not half-built.
- Key handling — presence-only crosses the seam; the key never appears in a
  built payload's non-env fields, nor in `process.env`.
- Plugin-check parser — real `installed_plugins.json` fixtures: present, absent,
  malformed (→ false, never a throw).
- `sharedEnvKeys` interaction — the injected server's env is explicit and does not
  depend on the adapter's inherited env (relevant after BL-24).
- Existing `acp.test.ts` must still pass unchanged: loredex-mcp injection behaviour
  is refactored, not altered.

## Spike results (2026-07-20, this machine)

| # | Question | Result |
|---|---|---|
| 1 | Does n8n-mcp run as stdio under plain node, with no API key? | **Yes.** 7 documentation tools, 1113 ms start. Also found: restricted `exports` breaks the `package.json` resolve trick. |
| 2 | Does the Claude ACP adapter honour an **injected stdio** server? | **Yes.** `session/new` accepted it and the adapter spawned the child (observed in `ps`). stdio is *not* in advertised `mcpCapabilities`. |
| 3 | Does it work without the native `better-sqlite3`? | **Yes, and faster** — 427 ms start on pure-WASM `sql.js`. `search_nodes("webhook")` returned 9910 chars of real data in **43 ms**, so the 96 MB DB genuinely loads and queries. |

Consequences: bundling is out, `--omit=optional` is mandatory, capability-gating
is wrong, and Lane 1 is confirmed buildable.

## Risks

1. **On-demand install needs a working `npm` at runtime.** This is the risk that
   replaced the two the spikes retired. A GUI-launched app does not inherit a
   login shell's PATH — the same root cause as the `spawn npx ENOENT` issue seen
   earlier in this project. Mitigation: resolve npm explicitly rather than
   trusting PATH, and treat install failure as a **Lane 3 fallback** — the setup
   card shows the exact `npm install --prefix` command with an Open-terminal
   button, which is the pattern the user asked for anyway. Install is therefore
   never a dead end, only a fallback to a button.
2. **Disk cost moves from the installer to the user's app-data** — ~154 MB once
   n8n is enabled. Acceptable because it is opt-in and one-time, but the enable
   toggle must state the size before downloading, not after.
3. **Skills are Claude-only.** Codex/Gemini ignore `~/.claude/skills` entirely.
   The UI must say so on the row rather than implying broader reach.
4. **Windows** remains unverified by the author on all of this, consistent with
   BL-24/BL-26.

## Decisions taken

- **On-demand install over bundling** (revised) — 96 MB of node docs must not
  ride in every installer for an opt-in feature.
- **`--omit=optional`** — forces pure-WASM `sql.js`; no native ABI coupling to
  Electron, no build toolchain on the user's machine. Measured faster too.
- **Never gate stdio on advertised capability** — the adapter honours what it
  does not advertise.
- **Registry over a second hardcoded server** — loredex-mcp becomes a row.
- **Key optional** — the 7-tool documentation mode is a legitimate state.
- **Claude-only skills this round** — user's explicit sequencing.
- **Live `tools/list` over a static list** — a hardcoded list would drift.
