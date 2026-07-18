# Plan: desktop-first agent-ops — "Add Client" button to a wired `claude` directory

**Status:** draft for review (2026-07-18). Grounded in
`docs/handover/desktop-state-for-agent-ops-2026-07-18.md` (verified against
desktop `main` @ 34ca701, loredex ^2.8.0) — read that first.

## Target flow (the whole point)

A non-technical team member, terminal-free:

1. Clients view → **＋ Add Client** → modal: name, manager (pick), connection
   checkboxes (from a golden client), one token field per connection.
2. Create → everything wires in one shot: folder scaffold, `workspace.yml`
   (env-refs only, committed), tokens into the OS keychain, generated
   `.mcp.json` / `.claude/settings.json` / `AGENTS.md` (gitignored, tokens
   expanded), one attributed git commit, sidebar/fleet refresh.
3. Client page → **Open in Terminal** → lands in the client dir → types
   `claude` → works. 100%, no env vars, no hand-edited YAML.

A client can hold **N MCP connections** (e.g. old-platform MCP to snapshot
data + new-platform MCP to upload it) — `workspace.yml`'s `mcp:` map already
models this; the UI must, too.

## The one architectural decision

**Tokens live in the OS keychain per machine, and materialize expands them
into the gitignored generated files.** Env-vars-in-shell cannot serve a
terminal-free team; committed tokens are forbidden (doctor secret-scan +
history is forever — we've been burned once). So:

- `workspace.yml` (committed): `${VAR}`-refs only — never a literal secret.
- Keychain (per machine): `VAR name → token`, via the existing
  `src/core/auth.ts` store (keychain on macOS, encrypted-file elsewhere).
- `materializeWorkspace(vault, client, { env })` already accepts an env
  overlay — the engine passes keychain values there. **No shell env involved.**
- Generated `.mcp.json` holds the expanded token but is covered by the
  scaffolded per-client `.gitignore` (verified in the fleet dex today).

Teammate on another machine: syncs the dex, sees the client with a
**Needs token** badge (declared refs vs keychain diff), pastes the token once
in the client page, done. Tokens deliberately do NOT sync — that's the
security model, and pasting once per machine is the entire cost.

## Phase 1 — lib (loredex repo), small

1. **Export the copy verbs**: `copyWorkspaceSpec` + `envSuffix` exist in
   `src/core/workspace.ts` (PR #24) but are missing from `lib.ts` — the
   desktop engine can't reach them. One-line export.
2. **Subset copy**: `copyWorkspaceSpec(..., { servers?: string[] })` — copy
   only the checked connections from the golden client (a client that only
   talks to the new platform shouldn't inherit the old-platform server).
3. **Declared-refs verb**: `workspaceEnvRefs(clientDir): string[]` — the
   `${VAR}` names a client's workspace.yml references. Desktop needs it for
   the Needs-token diff; doctor can reuse it. (Trivial: parse + ENV_REF scan.)
4. (Enables Phase 3) `scanFleet` carries `_inbox` item paths per client, or a
   `listClientInbox(vault, client)` verb — audit's consume-flow dead-end.

## Phase 2 — desktop: the Add Client button (the MVP)

Respect the architecture rules: engine facade only touches `loredex` lib
(anti-second-engine), typed channel in `ipc-contract.ts`, `withWriteLock` →
one attributed commit → `vault.changed`.

1. **Engine facade** `createClient(spec)`:
   `scaffoldClient` → `copyWorkspaceSpec(golden→slug, {servers})` →
   keychain-store tokens → `materializeWorkspace(..., {env: keychainValues})`
   → returns `{slug, missingEnv}`. Fast enough for an invoke (<10s); if the
   npx-touching steps ever drag, switch to the re-curate started/event shape.
2. **Channels**: `'clients.create'`, `'clients.tokens.set'` `{client, refs}`
   (paste/replace tokens + re-materialize), `'clients.workspace.status'`
   `{client}` → `{declaredRefs, missing, drift}` (wraps `--check` + keychain
   diff). Reuse `'clients.workspace'` for re-wire.
3. **Add Client modal** (Clients view header + ⌘K "Add client" + `＋ New`):
   reference modal anatomy — caps mono labels, stacked fields.
   - NAME (text) · MANAGER (dropdown of existing managers + "new…") · TAGS
     (chips, defaults `new-platform`)
   - CONNECTIONS: rows parsed from the golden client's workspace.yml — each a
     checkbox + server name + TOKEN paste field (password-style). Golden
     client configurable in Settings → General (default: first tooled client).
   - Footer: Cancel / **Create client**. On success: navigate to ClientPage.
4. **ClientPage workspace card**: per-connection row — server name, glyph
   status (`✓ wired` / `● needs token` / `△ drift`), inline paste field when
   missing, **Re-wire** button, **Open in Terminal** button (macOS:
   `open -a Terminal <clientDir>`; the terminal-free bridge to `claude`).
5. **Sidebar/fleet refresh** rides the existing `vault.changed` loop — no new
   plumbing.

Definition of done: create a client in the UI on the real fleet dex, then in
the opened terminal `claude` starts with the client's MCP servers live —
verified over the CDP harness + one manual end-to-end.

## Phase 3 — fleet-first dashboard (daily-use rethink)

Make agent-ops dexes open onto the fleet, not the research views:

1. **Today, fleet-aware**: for agent-ops dexes, top card = fleet triage —
   clients with pending inbox (oldest first), unwired/needs-token clients,
   lint errors. `useDex.fleet` already loads; the card is pure rendering.
2. **Clients view = home**: default nav target for agent-ops dexes; table
   gains workspace-status + lint columns next to inbox badges.
3. **Inbox consume MVP** (audit dead-end): ClientPage lists `_inbox` items
   (Phase 1.4), each with Open-in-Reader + **Consume** (lib verb moves it to
   its destination / `_randoms`, one commit) — no more hand-edit instruction.
4. **Shelves parity**: manager groups show client inboxCount badges; drill
   goes to ClientPage, not markdown Atlas.
5. Surface `lintAgentOps` globally (Clients nav pill already shows inbox;
   add lint count) + `manager:` facet in search UI.

## Explicitly out (YAGNI until asked)

- Pipeline/stage editing UI — `claude` in the wired directory IS the editor.
- Token sync between machines, token vault services, anything paid.
- Auto-installing the Claude Code genudo plugin on team machines: the
  generated `.claude/settings.json` enables it, but the marketplace add is a
  one-time per-machine step — goes in the team runbook, not the app.
  (If it proves annoying: drop the plugin from golden workspace.yml; the MCP
  servers alone carry the workflow.)

## Order + gates

Phase 1 → 2 ship together (the button is the deliverable); Phase 3 next
session(s). Desktop gates per handover: `npm run typecheck && npm test &&
npm run test:e2e`, design-fidelity suite, CDP visual verification against the
reference before commit. Lib gates: vitest + biome, PR flow.
