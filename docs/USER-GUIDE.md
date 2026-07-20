# Loredex Desktop — User Guide

Everything the app does, view by view. For what the vault itself is (filing rules, frontmatter, the CLI), read the [loredex user guide](https://github.com/ahmedtawfeeq1/loredex/blob/main/docs/USER-GUIDE.md) — this guide covers the desktop app.

## Contents

- [Getting started](#getting-started)
- [The window](#the-window)
- [Home](#home)
- [Reader](#reader)
- [Handoffs](#handoffs)
- [Atlas](#atlas)
- [Contracts](#contracts)
- [Search](#search)
- [Activity](#activity)
- [Sync](#sync)
- [Settings](#settings)
- [Agent-ops: operate a client fleet](#agent-ops-operate-a-client-fleet)
- [AI agent panels](#ai-agent-panels)
- [Embedded terminal](#embedded-terminal)
- [Routing a note](#routing-a-note)
- [The wizards](#the-wizards)
- [Command palette](#command-palette)
- [Keyboard map](#keyboard-map)
- [Notifications](#notifications)
- [MCP: connect your agents](#mcp-connect-your-agents)

## Getting started

Launch with no vault configured and you get the first-run screen with three cards:

- **Create a vault** — scaffold a fresh vault, optionally wired to a git remote ([wizard details](#the-wizards)).
- **Join a vault** — clone your team's existing vault by pasting its git URL.
- **Open an existing folder** — point the app at a loredex vault already on disk (a folder with `projects/` created by `npx loredex init`).

You can switch vaults any time with **File → Open Vault…** (⌘O).

Set your **identity** early (Settings → Identity): `Name` and `email`. Every write the app makes — accepting a handoff, composing one, routing a note — is attributed to this identity in the note's frontmatter and in the git commit. Writes are blocked until it's set; reading never is.

## The window

A sidebar of nine views (⌘1–⌘9, same order), a contextual pane, and a detail pane. At the bottom of the sidebar: the **vault identity chip** — vault name, sync dot, engine version — so you always know which vault and which engine you're looking at. The **Handoffs** item carries a badge counting open inbound handoffs (snoozed ones excluded until they expire).

Light and dark themes are both first-class; the app follows the system by default (Settings → Appearance).

## Home

A full-width **insight dashboard** — the morning answer to "where do I look next". Every number comes from data the app already has, and every tile is a one-click jump into the view that acts on it:

- **KPI row** — open inbound (and across how many projects), requests still waiting for a reply, the oldest open handoff with its route (amber at 2 days, rust at 5), contract changes in the last 7 days, stale briefs, and sync health.
- **Needs attention** — open and expired-snooze handoffs, oldest first. Click a row for its card; hover for inline **Consume / Snooze / Reopen** — the same actions as the board, receipt toast included.
- **Blocked · critical path** — the blocking sentences, verbatim, with a jump to the Atlas blocked view.
- **Project pulse** — one row per project: note count, last activity, open flow in/out, and whether its brief is fresh, stale, or missing. Click for that project's Atlas Learn view.
- **Contract churn** — registered contract files changed in the last 7 days, with linked-handoff counts; click opens the Contracts timeline scoped to that file's project. The section only appears once project roots are registered.
- **Today's activity** — counts by kind since midnight plus a per-hour density strip; click for the full feed.
- **Product brief** — the curated Start Here brief demotes to a link-out card with its freshness badge; **Open in Reader** shows the prose with working links. No curated brief yet? The dashboard above *is* the live state; run the CLI's curation to produce one.

There is no Refresh button here: the dashboard recomputes itself on vault watcher and remote poller events. A vault with no remote shows a quiet local-only line with a link to wire one; a fresh empty vault offers **Route a note…** and **Join a vault…** to get going.

## Reader

The vault tree on the left, the rendered note on the right.

- **Wikilinks resolve** the same way the engine resolves them (shortest-path, vault-wide). Broken links don't become phantom pages — they're collected in a **diagnostics panel** below the note.
- **Commit SHAs** in note bodies become links to the vault remote's commit page (GitHub remotes; anything else renders as plain monospace).
- Markdown renders through one sanitized pipeline — note content is never executed.
- **Drag a markdown file** from Finder onto the note pane to route it into the vault ([details](#routing-a-note)).

## Handoffs

The team baton, full lifecycle. Two lanes per project — **Inbox** (handoffs to you) and **Outbox** (from you) — with a project switcher and a company-wide view that shows every project's lanes at once.

Each card is a routing slip: status stamp, `from ⟶ to` route line, date, objective. Cards open into the full brief with a **thread rail** — replies, comments, and the request a delivery fulfills, rendered as a connected chain. Request cards carry a `REQUEST` chip; a request whose delivery arrived shows `FULFILLED`.

**Lifecycle actions**, each one attributed write committed to the vault:

| Action | What it writes |
|---|---|
| **Accept** | `status: accepted` + who/when |
| **Decline** | `status: declined` + who/when + a required reason |
| **Snooze** | `status: snoozed` + who/when + an until-date. When the date passes the card resurfaces with the open ones (and you get one toast) — the app never silently rewrites status |
| **Reopen** | back to `open`, from declined/snoozed; prior attribution is kept as history |
| **Consume** | `status: consumed` + who/when — terminal, the "I have taken this in" |

**Writing**: ⌘N composes a new handoff (request or delivery, target project, objective, reading order from real notes — assembled verbatim, no generation). **Reply** from any card inverts the route and links the thread. **Comment** adds a note to the thread without touching the handoff itself.

Illegal transitions are refused with a typed error, not worked around. If a merged PR references one of your open handoffs, the app **suggests** a status change as a toast with an Apply button — it never applies one itself.

## Atlas

The whole vault as a graph — notes, handoffs, projects, topics, sources, commits, contracts — at three discrete zoom levels:

- **Overview** — project clusters and the flow between them, with aggregated `N open / M total` route badges.
- **Learn** — one project: its topics as collapsible atoms.
- **Deep Dive** — everything in scope.

Breadcrumbs and ⌘[ / ⌘] history make it navigable like a browser. **Everything is a hyperlink**: a note node opens the Reader, a handoff opens its brief and thread, a project drills in, a source file opens your editor, a commit opens GitHub, a contract opens the Contracts timeline, an edge opens the handoff that created it.

Toolbar: **Tours** (guided walks derived from reading orders, threads, or topic date-order — the derivation is always labeled), **Path** (trace the dependency chain between two nodes), **Blocked** (what's waiting on what), filters and search with match rings, a changed-since overlay, and **Export SVG / PNG**.

## Contracts

Read-only intelligence over your API contract files — OpenAPI, Postman collections, GraphQL schemas — discovered in the project repos you register (Settings → Contracts, or the wizard's prompt when joining). The timeline lists every change from git history: file, +/- counts, author, commit hash; click through to the **unified diff pinned to that commit** (never your worktree; very large diffs are truncated with a visible flag).

Changes link to handoffs in two labeled tiers: **mentioned** (the commit SHA literally appears in a handoff — solid chip) and **heuristic** (same project, same day — dashed chip, could be unrelated). The label is never dropped. Filtering is per-project (a per-file filter is on the list).

## Search

Full-text search over the vault with facets: **project**, **topic**, **type**, **status**, **from**, **to**. Results rank the way the engine ranks (briefs above raw notes, stale sinks). ⏎ opens the hit in the Reader.

## Activity

The team's history — routes, handoffs, consumes, syncs — parsed from the vault's git log, grouped by day, deduplicated by commit. Hover a row for the touched paths; SHAs link to the remote.

## Sync

The health panel: ahead/behind vs the remote, status warnings (schema mismatches, MCP port conflicts, anything git prints to stderr — nothing is swallowed), last sync details, and a session warning log.

**Sync now** (⇧⌘S) commits, pulls, and pushes under the app's write lock. In the background a **poller** fetches every 60 seconds while the app is focused (5 minutes in the background), detects teammates' new handoffs and status changes *without merging*, and only integrates (`git pull`) when you're not mid-write and the worktree is clean — the panel shows "behind N" while it waits. After every integrate, views rebuild from disk truth.

On **agent-ops** dexes the poller also **auto-pushes** your local commits once they've settled (~30 seconds after the last one, fast-forward-only, never holding the write lock) — so snapshots, scaffolds, and agent/terminal work reach the team without a manual Sync. A top-bar **"N unpushed"** pill appears if commits linger (offline, no remote). Research dexes stay pull-only, unchanged.

## Settings

- **Appearance** — system / light / dark.
- **Identity** — name and email; injected per git command, never read from your global git config.
- **Contracts** — the project repo folders to scan, plus extra glob patterns for contract files.
- **GitHub** — shows whether the `gh` CLI is available (that's what powers PR chips and merged-PR suggestions; without it you still get plain commit links). Re-check after installing.
- **MCP server** — host status and a port override, the sanctioned answer to a port conflict ([details](#mcp-connect-your-agents)).
- **Agent permissions** *(agent-ops dexes only)* — the always-allow rules an AI chat has saved, per `(client, tool kind)`; remove one to restore the prompt.

## Agent-ops: operate a client fleet

Open an **agent-ops** dex (create one with `loredex init --type agent-ops`, or the create-vault wizard) and a **Clients** view joins the sidebar. It's the operating console for an agency running a fleet of client AI-agent deployments: managers → clients → pipelines/agents → stages.

**The Clients list** groups clients under their manager, each with a health dot (schema problems, pending inbox). Click one for its page.

**A client page** shows everything for one deployment:

- **Pipelines & Agents** — each unit with its ordered stage rail (`01 → 02 → …`); every file name is a link that opens in the Reader. `+ Pipeline` / `+ Agent` create a unit; `+ Stage` inserts one (choosing *At end / Before / After*, renumbering the rest). Each is one attributed commit — you never hand-edit dex files.
- **Versions** — `⧉ Snapshot` on any unit copies its definition into `_versions/<unit>/<stamp>/` (optionally with a note + the knowledge tables). The Versions section lists snapshots newest-first; a row opens its manifest.
- **Knowledge tables** — the client's grounding CSVs; **Reveal Folder** opens `knowledge_tables/` in your file manager to drop new ones in.
- **Credentials** — the client's platform logins, kept in your **OS keychain** (never the dex). Add / Reveal / Copy / Edit / Delete; the list shows metadata only, secrets are fetched on demand.
- **Agent tooling** — generate `.mcp.json` / `.claude` settings / `AGENTS.md` from `workspace.yml` (**Wire** / **Re-wire**), paste one token per connection, and run a **live connection probe** (green = a real MCP handshake). **Chat Here** and **Open in Terminal** drop an AI chat or the terminal into the client's folder.
- **Inbox** — intake files pending consumption: **open**, **keep → randoms**, or **delete** each.

**Adding a client** is terminal-free: the Add-Client flow scaffolds the client, copies a golden client's standard tooling with per-client env rewrite, and probes each connection.

Binary files (`.pdf`, `.xlsx`, `.png`, …) in the tree open in your OS default app; folders reveal in Finder/Explorer. All of this is safe on a shared dex — a realpath containment check plus an extension allowlist mean a teammate-committed executable is revealed, never launched.

## AI agent panels

The right-side **agent panel** (toggle in the top bar) is a chat with a coding agent — **Claude Code** or **Codex** — over the Agent Client Protocol:

- Rich markdown, tool-call diffs, a usage/cost meter, and slash-command autocomplete in the composer (Enter sends, Shift+Enter for a newline); attach images where the agent supports them.
- **History** (the clock button) reopens past conversations; threads **auto-title** from their first message.
- **Cross-provider continuation** carries a conversation from one agent to another; **pop-out** runs a chat in its own window.
- On an agent-ops dex, **Chat Here** scopes a session to a client (a `◈ <client>` chip marks it) so it runs with that client's own MCP servers. When the agent asks permission for a tool, you can tick **"Always allow `<kind>` for `<client>`"** — matching requests then auto-answer with no modal (manage them in **Settings → Agent permissions**). A top-bar badge counts pending requests while the panel is closed.

## Embedded terminal

A full terminal (xterm.js) docks at the bottom or left (top-bar buttons, or **Open in Terminal** on a client). VS Code-style splits let you run several shells; a chat or terminal can pop out into its own window. Local commits it makes are auto-pushed on agent-ops dexes (see [Sync](#sync)).

## Routing a note

Any markdown file on disk can be filed into the vault without the CLI: hit ⇧⌘R (or **Route a note…** in the sidebar) and pick a file, or drag one onto the Reader. The app shows a **plan-first confirm card** — where the file will land and why — before anything is written; the write itself goes through the same router the CLI uses. (Undo for routes is planned, not shipped — the receipt tells you exactly what was written.)

## The wizards

**Create a vault**: pick an empty destination → optionally paste a git remote URL (checked with `git ls-remote` *before* anything is written) → confirm identity → the vault is scaffolded, committed, and pushed. Every failure is typed and honest — a bad URL or missing credentials tells you to check your SSH key or credential helper; **the app never asks for a GitHub login**. If remote wiring fails after scaffolding, you still have a valid local vault and can retry from Sync settings.

**Join a vault**: paste the team vault's clone URL → pick a destination → the app clones, validates it's actually a loredex vault, checks the schema handshake (a vault newer than the engine joins read-mostly with a loud warning), asks where this team's repos live on your machine (skippable — powers Contracts), and seeds the poller quietly so joining never triggers a notification storm.

Teammates can also send a **`loredex://join?remote=…` deep link** — it opens the join wizard pre-filled.

## Command palette

⌘K, from anywhere — every global action lives here with its shortcut hint: view navigation, new handoff, route a note, sync now, plus contextual actions like atlas navigation and reply/comment on the open handoff. Type to filter, ↑↓ to move, ⏎ to run. If something is clickable, it's in the palette; a unit test enforces that.

## Keyboard map

Press `?` in the app for this same map. Ctrl works wherever ⌘ is shown.

| Keys | Action |
|---|---|
| ⌘K | Command palette (works everywhere, even over modals) |
| ⌘1 – ⌘9 | Go to Home · Reader · Handoffs · Atlas · Contracts · Search · Activity · Sync · Settings |
| ⌘N | New handoff |
| ⇧⌘R | Route a note |
| ⇧⌘S | Sync now |
| ⌘O | Open Vault… (menu) |
| `?` | Keyboard cheatsheet |

Per context:

| Keys | Where | Action |
|---|---|---|
| ⌘[ / ⌘] | Atlas | History back / forward |
| ⏎ | Atlas | Open the focused node |
| ⇥ / ⇧⇥ | Lists & cards | Move through rows and controls in visual order |
| ⏎ | Lists & cards | Open the focused card / row |
| ⌘⏎ | Handoff card | Consume the focused card |
| ↑↓ · ⏎ | Palette & search | Navigate · open |
| Esc | Modals | Cancel (focus returns to the page) |
| ⌘⏎ | Modals | Submit |

Shortcuts never fire while you're typing in a field, and modals keep their own keys.

## Notifications

New inbound handoffs and status changes raise native macOS notifications (snoozed handoffs stay quiet until they expire). Clicking one opens the handoff's brief; a batched summary opens the board. The dock badge counts open inbound handoffs plus expired snoozes.

## MCP: connect your agents

While a vault is open, the app hosts an MCP server (Streamable HTTP) on `127.0.0.1` — port **52017** by default, overridable in Settings. It requires a per-install bearer token and validates request origins; it is never reachable from off the machine.

Agents find it through the **discovery file** the app writes on startup and removes on quit:

```jsonc
// ~/.loredex/desktop.json   (chmod 600 — owner only)
{
  "port": 52017,
  "token": "<per-install secret>",
  "engineVersion": "…",
  "schemaVersion": 2
}
```

Wire up **Claude Code** (any MCP client works the same way — URL plus bearer header):

```sh
token=$(sed -n 's/.*"token": "\(.*\)".*/\1/p' ~/.loredex/desktop.json)
claude mcp add --transport http loredex-desktop http://127.0.0.1:52017 \
  --header "Authorization: Bearer ${token}"
```

The tools are the exact set the CLI's `loredex mcp` stdio server exposes — same factory, one engine, so the agent and the app can never disagree:

| Tool | What it does |
|---|---|
| `vault_search` | Ranked term search (briefs above raw notes, stale sinks) |
| `vault_note` | Read one note (vault paths only, symlink-escape proof) |
| `handoffs_open` / `handoff_consume` | The team baton, from inside a session |
| `product_state` | Every project's freshness + open handoffs at a glance |
| `vault_store` | Write a note through the router — never a raw file write |

Every tool response ends with a `vault:` identity line — the same vault name and remote the app's identity chip shows — so an agent (and you, reading its transcript) always knows which vault answered. A `loredex mcp --via-desktop` CLI proxy that reads the discovery file automatically is planned but not shipped yet; until then, connect over HTTP as above.

If the port is taken, the app does **not** silently pick another one — you get a loud warning in Sync and a message telling you to set a different port in Settings and reopen the vault. Whatever port actually binds is what the discovery file records.
