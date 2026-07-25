# Epic — an "Extensions" surface for loredex

> Research + plan. Produced by a multi-agent research workflow (2 internal architecture
> maps + 6 external surveys → synthesis → tiered plan), 2026-07-24. File:line references
> are the workflow's, spot-checked against the tree; treat step 1 as the load-bearing
> refactor that proves them.

## The ask, and the reframe

The ask: *"add any extension — including Claude and Codex — and run it like an IDE, like
Antigravity."*

The trap: reading "extension, like VS Code / Antigravity" as **run real `.vsix`
extensions**. That is off the table, and it isn't what the ask actually needs.

**Why Antigravity can run `.vsix` and loredex can't cheaply.** Antigravity is a *fork of
VS Code's open-source core* (Code-OSS — same lineage as Cursor and Windsurf; likely a
fork of Windsurf, itself a fork). By inheriting the whole editor it gets the Extension
Host process, the monthly-versioned `vscode` API surface, and the `contributes` /
`activationEvents` machinery for free, then repoints the marketplace at Open VSX (it
can't touch Microsoft's Marketplace — that's ToU-restricted to MS-branded products, which
is why MS blocked Cursor). loredex is deliberately **not a fork** — it's an Electron 43 +
React 19 app with its own Cobalt renderer and *no workbench to inject editor features
into*. Matching Antigravity would mean either forever-rebasing a multi-million-line editor
(abandoning loredex's identity) or embedding Eclipse Theia's from-scratch `vscode`-API
reimplementation — the only non-fork host that ever pulled it off, which took a **funded
team ~6 years** and still chases each monthly release. Both are out for a zero-budget solo
dev on unsigned releases.

**The saving grace:** Antigravity's `.vsix` ecosystem is mostly *editor plumbing* —
language servers, themes, views. Its **agent panels are not extensions**; they're the same
*spawn-a-subprocess-and-drive-it-over-a-protocol* pattern loredex already runs. So loredex
reaches Antigravity-class "add and run any agent/tool" UX **through the protocols it
already speaks**, with none of the fork cost — and simply never reaches the `.vsix`
editor-feature ecosystem, which a Markdown-reader-plus-agent-panel doesn't need.

**What "extension" actually means for loredex.** loredex already speaks three real
extension protocols. An "extension" is any unit registered into one of them:

1. **ACP agent adapter** — a spawn recipe (node-module package *or* user binary + args)
   run as a subprocess and driven over the ACP JSON-RPC wire. **This is exactly what
   claude / codex / gemini already are** (`acp-spawn.ts` `ADAPTER` record — the header
   comment literally says *"Adding a provider = one row here"*).
2. **MCP server** — a stdio command or remote HTTP endpoint declared as one entry,
   attached per session and probed for its tool list (`workspace-mcp.ts`, `mcp-tools.ts`).
3. **Claude plugin / skill / marketplace** — markdown+JSON under `~/.claude` the Agent SDK
   auto-loads into panel sessions (`claude-plugins.ts`; confirmed live).

So *"add any extension including Claude and Codex and run it like an IDE"* decomposes
cleanly: **Claude and Codex ARE ACP adapters** (plane 1); the capability-style extensions
people also mean are **MCP servers and Claude plugins** (plane 2). The feature is not
"reimplement VS Code" — it's **a native browse / install / enable UI over registries
loredex already runs.** This is precisely Zed's and Antigravity's *"External Agents / Add
Custom Agent"* model, on the ACP protocol loredex already uses.

## Taxonomy — the seven things "extension" could mean here

| Kind | Already there | Effort | Verdict |
|---|---|---|---|
| **ACP agent adapter** (agent subprocess over ACP) | ~90% — `AdapterSpawn` union already *is* the descriptor; whole `acp.ts` pipeline is capability-driven, never branches on provider | small | **do-first** |
| **Per-descriptor consent gate** (security floor) | park-modal-resume mechanism exists but is 100% Claude-hardcoded; typed-consent pattern already shipped once | small | **do-first** |
| **MCP-server registry / marketplace tab** | loredex already spawns/probes/persists 3rd-party MCP servers + keychain secrets + Verify UI | medium | do-later (v2) |
| **ACP-registry one-click install** (agent distribution) | nothing yet, but a thin add-on once the runtime registry exists — one HTTP GET | small | do-later (v1.5) |
| **Claude plugin / marketplace browser** | `claude-plugins.ts` already detects + emits the exact commands + Verify UI | medium | maybe (v3) |
| **In-process JS/TS plugin SDK** (opencode/Cline style) | nothing — deliberately. Pulls arbitrary code into loredex's own process; ACP/MCP give this out-of-process for free | large | **do-not** |
| **Real VS Code `.vsix` host** (embed Theia / fork Code-OSS) | nothing — not a fork, no workbench, MS Marketplace legally off-limits, ~6 funded-years of work, delivers editor plumbing the product doesn't want | insane | **do-not** |

## The plan

### First step (single PR, zero behavior change)

In `src/core/acp-spawn.ts`, collapse the three parallel const records —
`ADAPTER` (24), `PROVIDER_KEYS` (101), `BILLING_KEYS` (112) — plus `agent-keys.ts` `KEY_VAR`
(16) into **one `AdapterDescriptor` per agent** and a single
`descriptors: Record<string, AdapterDescriptor>` map. Change
`spawnAdapter` / `adapterEntry` / `adapterEnv` / `authMode` to look up **by id** from that
map instead of indexing the separate records. Ship with the 3 built-ins hardcoded, no
persistence, no UI, no new union member — **every existing test green.** This proves the
descriptor shape and the by-id read path with zero risk; every tier builds on it.

### v1 — Unified Extensions › Agents manager  *(effort: ~1 week)*

Make the already-hardcoded adapter registry **user-editable and runtime-addable** for
user-binary agents, gated by a mandatory consent screen. Delivers the literal ask, because
Claude and Codex are already rows in that registry.

- Promote the closed `AcpAgent` union + const records into the **runtime descriptor
  registry** from step 1; persist user-added descriptors as an **id-keyed blob in the
  `meta` table** (`metaGet/Set`, exactly like `workspace-mcp-enabled` — **no schema
  migration**).
- **Extensions › Agents CRUD form for user-binary adapters only**
  (`{id, displayName, command, args[], env, keyVar}`) — Zed/Antigravity "Add Custom
  Agent". Node-module adapters stay ship-only (they must live in loredex's asar-unpacked
  `node_modules`; **do not** reintroduce the `npx`/PATH resolution the design rejected).
- **Generalize the Claude gate** (`agentPanel.ts` openHere ~684): the park-modal-resume
  becomes a per-descriptor gate keyed on `descriptor.consentRequired`;
  `ClaudeSubscriptionGate.tsx` becomes a general consent modal that shows the **exact
  resolved command + env, untruncated**, and flags dangerous patterns (`sudo`, `rm -rf`,
  `~/.ssh`, network) before first spawn. Claude's subscription descriptor keeps
  `consentRequired: true` → **no regression.**
- **Close the gaps that losing compile-time exhaustiveness creates:** runtime-validate
  every descriptor supplies `label/tag/spawn/keys`; make `authMode` read a declared
  `authSemantics` field rather than presence-of-key; move gemini's ENOENT install hint
  into the descriptor; drive `AgentAuthSection`'s `PROVIDERS` array and `AgentPanel`
  `AGENT_META` from the registry.

Files: `ipc-contract.ts`, `acp-spawn.ts`, `agent-keys.ts`, `handlers.ts`, `ipc.ts`,
`settings.ts`, `agentPanel.ts`, `AgentPanel.tsx`, `ClaudeSubscriptionGate.tsx`,
`AgentAuthSection.tsx`, `ExtensionsSection.tsx` (new).

Risks: malformed descriptor becomes a runtime bug (mitigated by the validator — don't ship
without it); keep the guardrail's fail-open read but ensure a `consentRequired` descriptor
still parks; resist scope creep to runtime node-module installs; pin the persisted schema
now so later tiers don't force a migration.

### v1.5 — Install from ACP Registry  *(effort: days)*

Read-only fetch of the public
`https://cdn.agentclientprotocol.com/registry/v1/latest/registry.json` (GitHub-backed free
CDN, zero hosting) and one-click install its ~30 listed agents (Claude Code, Codex, Gemini,
Cline, opencode, Goose…) as user-binary descriptors. Every install still routes through the
v1 consent gate + resolved-command preview. Registry fields are **untrusted third-party
command strings** — never spawn without the preview; fetch fails soft (cached/empty list,
never blocks settings).

Files: `acp-registry.ts` (new), `handlers.ts`, `ipc.ts`, `ExtensionsSection.tsx`.

### v2 — MCP-server registry / marketplace tab  *(effort: weeks)*

Generalize the fixed `WorkspaceServerId` enum (`types.ts:680`) + hand-written per-server
JSX into a data-driven descriptor table; add a **Browse** tab over the official MCP Registry
(metadata-only, reverse-DNS verified; Smithery/PulseMCP for volume); a generic installer
ingesting `server.json` (stdio `packages[]` / remote `remotes[]`) or `.mcpb` ("the `.vsix`
of MCP") — secrets → keychain, config → meta; reuse `mcp-tools.ts` probe as the verifier.
Add **tool-pinning** (hash tool name+description at approval, re-prompt on change) as
rug-pull defense. *Note: the existing per-server MCP UI already covers common cases — verify
the marketplace earns its complexity before building it.*

### v3 — Claude plugin / marketplace browser  *(effort: weeks, "maybe")*

A provider-scoped "Manage plugins" panel (Plugins + Marketplaces tabs, like the official VS
Code Claude extension) over the two hosted Claude catalogs, **driving** install
(`claude plugin install <plugin>@<marketplace>`, or writing
`extraKnownMarketplaces`/`enabledPlugins` to `~/.claude`) rather than only instructing,
applied by restarting the Claude ACP session. Detect+instruct+Verify already works today, so
this is a UX upgrade, not a capability gap — lowest priority.

## The security floor — non-negotiable

The Claude subscription guardrail exists because *no `ANTHROPIC_API_KEY` → Claude falls back
to `~/.claude` subscription OAuth, which Anthropic's Consumer Terms prohibit in third-party
apps.* Today that gate is hardcoded `if (agent === 'claude')`.

**The Extensions surface must not weaken it.** An "add any extension" surface that ships
*without* a generalized consent gate silently reintroduces exactly that ToS/ban exposure —
now for *every* new agent, any of which might authenticate via a prohibited consumer
subscription. So:

1. v1 turns the gate into a per-descriptor `consentRequired` / `authSemantics` flag; Claude's
   subscription descriptor keeps it → same modal fires, no regression.
2. **Every** new agent extension (custom user-binary, or ACP-registry install) routes through
   the same generalized gate before its **first** spawn, showing the untruncated resolved
   command + env and flagging dangerous patterns. A newly added agent can never silently
   reach subscription-OAuth or run an unreviewed command.
3. Secrets stay in the OS keychain (VAR-namespaced, presence-only across IPC — tokens never
   reach the renderer). Least-privilege env scoping means a descriptor receives only the keys
   it declares; declare none, get none.

Explicit non-goal: **OS-level process sandboxing** (containers/seatbelt) of spawned
extensions — expensive-to-insane at this budget. The floor is *explicit consent +
secrets-in-keychain + (v2) tool-pinning*, and **out-of-process ACP/MCP isolation** rather
than any in-process JS plugin host. A spawned adapter still runs with the user's file access
— that is the honest core delta between "run any extension" and today's 3-vetted-adapter
model, and consent-before-first-spawn is what covers it.

## Non-goals (say no on purpose)

- Running real VS Code `.vsix` (embed Theia / fork Code-OSS) — insane, off-brand, delivers
  plumbing the product doesn't need.
- Touching the Microsoft Visual Studio Marketplace — ToU-restricted to MS products.
- An in-process JS/TS plugin SDK — arbitrary code in loredex's own process; ACP/MCP give it
  out-of-process for free.
- Runtime-installing **node-module** ACP adapters via `npx`/PATH — they must ship in
  asar-unpacked `node_modules`; only **user-binary** adapters are safely runtime-addable.
- Copying the official VS Code / JetBrains Claude extensions — they're IDE front-ends that
  spawn the same agent loredex already spawns; **loredex is the front-end.** Only the
  plugin-manager UX is worth copying.
- Shipping any of this **without** the generalized consent gate.

## Open decisions (for you)

1. **v1 UI home** — a top-level "Extensions" nav item (Antigravity-style) vs. an Extensions
   section inside Settings (cheapest, reuses `WorkspaceServersSection` patterns).
2. **Naming** — "Extensions" vs. "Agents & Tools" (the latter sets clearer expectations and
   avoids implying `.vsix` support).
3. **v1.5 folding** — ship ACP-registry one-click *inside* v1's PR, or as a fast follow.
4. **Consent granularity** — one-time per descriptor, vs. re-prompt whenever the resolved
   command/env changes (stronger, more friction). *Recommended: one-time, but re-prompt on
   command/env change.*
5. **Persistence shape** — id-keyed JSON blob in `meta` (no migration) vs. a dedicated
   `extensions` table. *Recommended: meta blob; pin the schema now.*

## Provenance

Research workflow: 2 internal architecture maps (both completed) + 6 external surveys
(VS Code extension host, Continue/Cline/opencode, Claude plugins, MCP registry completed;
**Antigravity and Zed/ACP stalled** after 5 retries). The two stalled surveys were
backfilled — Antigravity's fork model confirmed by direct search (VS Code fork, Open VSX,
dual Editor+Manager, agent-panels-are-not-extensions), and Zed's `agent_servers` /
"Add Custom Agent" model and the public ACP registry are captured in the taxonomy — so no
material gap remains.
