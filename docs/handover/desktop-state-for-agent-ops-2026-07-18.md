# Loredex Desktop — state handover for the agent-ops track (2026-07-18)

For the session designing the **agent-ops dex experience** (fleet of clients,
desktop-first: add a client with a button, pick manager, paste token, land in
a wired directory where `claude` just works). This is what the desktop looks
like TODAY after the v3 redesign + parity pass, which seams exist for you, and
which rules you must not break. Everything here is verified against `main`
(commit `34ca701`, app v0.8.1+, loredex lib ^2.8.0).

## 1. What the app is now (v3 "Obsidian Glass / Cobalt")

One Electron window: 42px top bar (⌘K action palette · sync pill · avatar) over
a left sidebar + content pane. Sidebar: `＋ New [C]`, nav ⌘1-9 — Today, Inbox,
Plan, Reader, Atlas, Agents, Activity, Search, Settings (numbering derives from
`VIEW_ORDER` position; **Clients** appears unnumbered when the open dex is
agent-ops) — then product shelves (product → project rows with tint dots and
open-count/stale badges), pinned Settings, keys footer. Sidebar and reader list
both collapse (⌘\ / ⇧⌘\; visible ‹ › buttons).

Views, all restyled to the reference in `handoff 2/screens` + `docs/design/reference/dom/*.html`:
- **Today** — needs-you triage queue, Re-curate flow (confirm → background CLI
  job → logo-spinner → before/after dialog), sprint card on real work items,
  project pulse, velocity/backlog charts.
- **Inbox** — For me/Created/All lanes, state discs (amber ring open, half-green
  accepted, dimmed terminal), detail pane with a **vertical action panel**
  (✓ Consume, Accept/Decline/Snooze, Comment/Hand back/Link request,
  Archive/Delete two-step).
- **Plan** — five-column board (TRIAGE·TODO·IN PROGRESS·REVIEW·DONE) over the
  lib work-item plane (`work.list`/`work.update`), **drag-and-drop** runs the
  same legal transitions as the buttons (`dropAction()` in PlanView is the
  pure legality map).
- **Reader** — dex tree (product boxes → indented project boxes → folder-icon
  topics → notes), note + collapsed PROPERTIES editor, collapsible meta rail
  (used-by work items, quick facts, backlinks, compact thread, MANAGE:
  Archive/Unarchive/Delete).
- **Atlas** — Map/Project/Thread/Deep Dive lenses; Project lens is the
  three-column RECEIVES / TOPICS / SENDS layout. Heavy graphs (>350 elements)
  disable hover emphasis (renderer-crash guard).
- **Agents** — live/idle table (git attribution + MCP-ring attribution),
  merged [MCP]/[GIT] session feed, per-agent bearer tokens (mint/revoke).
- **Activity** — day-grouped rows of kind chips over the vault git log.
- **Settings** — two-pane IA: General, Projects & contracts, Members & agents,
  Filing rules │ Appearance, Typography, Shortcuts │ MCP server (real
  autostart + write-tools toggles, copy-connect-snippet), Sync & git, GitHub
  (device-flow sign-in, keychain token).

Geist / Geist Mono are the default typography (vendored woff2). Fake demo
items are prefixed `FAKE ·` in the user's dex; delete freely.

## 2. Architecture you must respect

- **Core host** (`src/core/`) is the only place that imports `loredex` —
  `src/core/engine.ts` is the sole facade (**anti-second-engine rule**: never
  parse/write dex files yourself; if the lib lacks a verb, add it to the lib).
- Typed IPC in `src/shared/ipc-contract.ts` (invoke channels + `CoreEvent`
  push union). Renderer = React 19 + Zustand stores (`src/renderer/src/stores`).
- Long jobs must NOT ride an invoke (10s timeout): follow the re-curate
  pattern — channel returns `{started}` immediately, a `CoreEvent` closes the
  loop (`recurate.done` is the model).
- Writes go through `withWriteLock` in `src/core/handlers.ts`, land as ONE
  attributed git commit, and emit `vault.changed` so every read model refreshes.
- Design law: `docs/DESIGN.md` v3 amendment + `src/renderer/src/assets/loredex-v3.css`
  (verbatim drop-in — never transcribe) enforced by
  `src/renderer/src/design-fidelity.test.ts`. One cobalt primary per view;
  status = glyph + label; mono for machine facts; 1px hairlines; both themes.
- Gates: `npm run typecheck && npm test && npm run test:e2e`. Known-flaky git
  suites (perf/poller/route-safety/set-frontmatter) pass isolated.
- Visual verification harness: `LOREDEX_DEBUG_PORT=9337 npm run dev`, then
  screenshot/eval over CDP — verify every UI slice against a reference before
  committing.

## 3. Agent-ops surfaces that exist TODAY

Dex type comes from `loadDexType` (`'research'` default; `loredex init --type
agent-ops`). `useDex` store carries `type` + `fleet`.

- Channels (`src/shared/ipc-contract.ts`):
  - `'clients.fleet'` → `ClientInfo[]` (lib `scanFleet`: pipelines, agents,
    stages, tables, inboxCount per client)
  - `'clients.lints'` → `LintFinding[]` (lib `lintAgentOps`: schema drift,
    secrets)
  - `'clients.workspace'` `{client, check}` → `WorkspaceResult` (lib
    `materializeWorkspace` — generates the client's tooling from workspace.yml)
  - `'agents.tokens.list|mint|revoke'` — per-agent MCP bearer tokens
    (app-side, attribution in the session feed)
- UI: **Clients** nav view (gated on dex type, unnumbered) → ClientPage;
  tree relabels the projects group "clients"; client tree rows show fleet tag
  chips + amber inbox badge; the Clients nav row shows the fleet-wide
  pending-inbox count (amber pill).
- Lib verbs already exported (see `node_modules/loredex/dist/lib.d.ts`):
  `scaffoldClient`, `scaffoldAgent`, `scaffoldPipeline`, `scaffoldStage`,
  `scanClient`, `scanFleet`, `loadClients`/`saveClients`, `addClientTag`,
  `workspaceSchema`, `loadWorkspaceSpec`, `materializeWorkspace`,
  `lintAgentOps`. **None of the scaffold verbs have desktop channels yet** —
  that's your seam to open (engine facade → handler → typed channel → UI).
- The CLI side just grew `loredex workspace <client> --from <golden-client>`
  (copy + env-ref rewrite by slug + materialize; PR #24 in the lib repo) —
  the desktop "add client" button should reuse exactly that path via the
  engine, not reimplement it.

## 4. Known gaps for agent-ops (from the 2026-07-17 18-agent audit)

Full detail: `docs/design/audit-2026-07-17.md` (§ Dex-type audit + judge P2s).
- **Inbox consume flow dead-ends**: ClientPage shows an inbox count + a
  hand-edit instruction; no item list, no consume action. Needs the lib to
  carry item paths in `scanFleet` (or a new verb) + a desktop action.
- **Today is fleet-blind** on agent-ops dexes: no pending/lint/oldest-age
  card despite `useDex.fleet` being loaded.
- **Shelves parity**: SideNav shelves are built from product groups —
  manager groups on agent-ops dexes render with research-style labels/badges
  instead of inboxCount; drill goes to markdown Atlas, not the client page.
- `manager:` search facet not surfaced in the search UI; lints not surfaced
  globally; clients CSS sits outside the design-fidelity guard.

## 5. The user's target flow (design toward this)

From the user, verbatim intent: the team must run agent-ops WITHOUT the
terminal — in the desktop app: press a button → **Add client** (name, pick
manager, paste per-client token) → everything wires automatically (workspace
files, `.mcp.json` with env-ref token, directory scaffold) → they `cd` into
the client dir, type `claude`, and it works. Also: one client can have
multiple MCPs/accounts (e.g. pull a snapshot from an old platform's MCP, push
via the new platform's MCP) — the model must allow N MCP connections per
client. Rethink the dashboard for daily fleet use.

Suggested seam shape (not built): `'clients.create'` channel → engine facade
over `scaffoldClient` + workspace `--from` copy + `materializeWorkspace`;
token handling like the existing GitHub-token pattern (OS keychain / env-ref
in workspace.yml — the token itself must never enter the vault or a commit);
UI as a modal from the Clients view following the reference modal anatomy
(caps mono labels, stacked fields, Cancel/Publish footer).

## 6. Working agreements

Keep-everything (§5.1): never drop an existing capability — re-home and
restyle it. Deviations go in the story's Dev Agent Record. Never put the
user's company name in loredex examples/docs/tests. Zero budget: no paid
infra, unsigned builds. Repo is public; releases build via GitHub Actions on
tags (v0.8.1 latest with 5 installers).
