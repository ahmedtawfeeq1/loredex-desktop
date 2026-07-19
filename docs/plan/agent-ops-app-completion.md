# Plan: agent-ops app completion — client-scoped agent, snapshots, credentials, auto-push, OS-open

**For an executing session. Written 2026-07-20. Author session did the vision→gap analysis; this plan closes the gaps the user ranked. Goal: automation specialists manage everything from the app — minimize terminal work.**

## Read this first

- Repos: `loredex` (core CLI/lib/MCP, npm) and `loredex-desktop` (Electron app), both under `/Users/tawfeeq/Business/GenuDo/Technical/md-files-reader/`.
- Desktop is on branch `feat/add-client-flow` with **uncommitted modified files** (AgentPanel.tsx, agentPanel.ts, acp.ts, handlers.ts, ipc-contract.ts, TopBar.tsx, terminals/discovery/agent-conversations, styles.css — a conversation-history feature in flight). **Do not clobber.** First step: `git status`, read the diff, commit or coordinate it before starting. Build on top of it.
- Desktop vendors core as `loredex-2.9.0-agentops.tgz`. Core work here ships as a new prerelease tarball (or npm prerelease) and a pin bump — follow whatever vendoring flow the existing `pinned-release.test.ts` asserts.
- Standing rules: conventional commits; fictional names only in fixtures/docs/tests (brightsmile_dental, peak_fitness, manager sara — NEVER the user's company name; a CI guard test greps for it); "dex" wording user-facing only (internal ids `vaultPath`, `vault.*` IPC, `vault_*` MCP tool names stay); interactive controls = proper-sized Buttons with capitalized labels, never tiny lowercase links; secrets never in git — `${ENV_VAR}` refs + OS keychain only.
- Design system: `loredex-desktop/DESIGN.md` (v3 cobalt) + `src/renderer/src/styles.css` tokens; design-fidelity tests exist — new UI must use existing tokens/components (`Modal`, `button-quiet`, `cp-*` client-page classes).
- Signature-stability rule in core: public lib functions keep signatures; branch internally on dex type.

Work packages ordered by user priority. A→E are independent enough to land as separate PRs; F is core-first (blocks E's UI half).

---

## WP-A — Client-scoped agent panel (top priority)

**User words: "when I open it from this client it should be scoped to this client — the chat panel, not just the terminal."**

Plumbing already exists — this is mostly renderer wiring:

- `acp.start` IPC already accepts `cwd` (`src/core/handlers.ts:818`; validated `src/core/acp.ts:243` → `ACP_CWD_INVALID`; adapter spawned with that cwd `src/core/acp.ts:361` → `acp-spawn.ts:142`).
- `useAgentPanel.openHere(cwd?)` already threads cwd (`src/renderer/src/stores/agentPanel.ts:557`).
- Every current caller passes NO cwd → vault root (`AgentPanel.tsx:641,770`, `TerminalDrawer.tsx:201`).
- `clients.dirAbs` IPC returns a client's absolute dir (used by ClientPage "Open in Terminal", `ClientPage.tsx:356`).

### Tasks

1. **ClientPage "Chat Here" button** next to the existing "Open in Terminal" (`ClientPage.tsx` header actions): `invoke('clients.dirAbs', {client}) → useAgentPanel.getState().openHere(dirAbs)` + open the agent panel drawer. Same pattern as the terminal button.
2. **Session scope label.** Sessions started with a client cwd must be identifiable: derive the client slug main-side when `cwd` sits under `projects/<slug>/` and include it in session metadata (`acp.ts` session record + the `acp.*` event payloads renderer-side). AgentPanel header + session/conversation list rows show a client chip (e.g. "◈ brightsmile-dental"). The in-flight conversation-history work touches `agent-conversations.ts` — integrate, don't fork.
3. **Workspace freshness before start.** A client chat is only truly scoped if the generated `.mcp.json`/`.claude/settings.json`/`AGENTS.md` exist and are current. In the "Chat Here" flow: call the existing workspace-status/materialize path (`clients.workspace.status` exists on ClientPage already) and if drift/missing → materialize first (reuse the ClientPage "Generate workspace" flow), THEN `acp.start`. Missing env vars → surface the existing missingEnv UI, still allow starting (degraded) with a visible warning.
4. **Verify adapter pickup.** Confirm the claude ACP adapter actually loads project-level `.mcp.json` + `.claude/settings.json` from its cwd (it spawns a Claude Code session in that cwd, so it should). Write one e2e/manual check: client fixture with a dummy MCP server in workspace.yml → start scoped session → adapter env/config includes it. If the adapter needs a flag to honor project config, add it in `acp-spawn.ts` spec.
5. **Default unchanged:** panel opened from TopBar/TerminalDrawer stays vault-root. No behavior change for research dexes.

**Tests:** store test — openHere(cwd) passes cwd through and session carries clientSlug; ClientPage render test — button present on agent-ops client page; acp.ts unit — slug derivation from cwd (containment-safe, handles `projects/x/y` → x, paths outside projects → no slug).

---

## WP-B — Tool-call permission popup ("allow" prompts)

**Status: core flow ALREADY BUILT.** `session/request_permission` is held until the renderer answers (`acp.ts:411,860`), mapped to an `acp.permission` event (`acp.ts:836`), FIFO-queued in the store (`agentPanel.ts:269`), answered via `invoke('acp.permission', …)` (`agentPanel.ts:781`), and every pending request is answered before cancel (`acp.ts:976`). A modal/UI exists in AgentPanel.

### Tasks (verify + polish, not rebuild)

1. **Audit the modal UX** against the design system: option buttons (allow / reject — whatever options ACP supplies) must be proper Buttons, show the tool name + command/input clearly, show WHICH session/client is asking (needs WP-A's client chip).
2. **"Always allow" persistence.** If the ACP protocol's permission options include an "always" variant, wire it; if not, add app-side auto-answer rules: per (client, toolName) remembered choice stored in the settings/meta table (same persistence used for other UI state), applied main-side before surfacing the popup. Include a management UI: small "Permissions" section in Settings listing remembered rules with a Remove button.
3. **Sound/attention:** when a permission arrives while the panel is closed, badge the TopBar agent toggle (reuse existing badge pattern) so requests don't silently hang.

**Tests:** rule-match unit test (client+tool → auto-answer, no event emitted); store test unchanged FIFO behavior when rules don't match.

---

## WP-C — Versions & snapshots (critical)

**User words: "button on the client page to create a snapshot for a pipeline: first the pipeline files (persona, instructions, …), then each stage under it (instructions, enter condition, actions, followup). Using the MCP tools."**

Interpretation (confirmed by user emphasis on MCP): the snapshot operation lives in **core** as a lib function + CLI command + MCP tool, so agents AND the app share one implementation. Desktop calls the lib function through the engine (its normal path); the MCP tool exists so client-scoped agent sessions can snapshot too.

### Core (`loredex` repo)

1. **`src/core/snapshot.ts`** — `snapshotUnit(vaultPath, client, unitName, opts?) → SnapshotResult`:
   - Resolves unit under `projects/<client>/pipelines/<unitName>` or `agents/<unitName>` (slugified, same resolution as scaffolds — note the `lead_reactivation` vs `lead-reactivation` slugify gotcha).
   - Copies, in order: the four `_` unit files, then for pipelines each `stages/NN_*/` dir's four files, preserving relative layout, into `projects/<client>/_versions/<unitName>/<stamp>/` where `<stamp>` = `YYYY-MM-DD_HHMMSS` (caller passes the date — keep the function pure/testable).
   - Writes `manifest.json` in the stamp dir: `{unit, kind, createdAt, files: [...], note?}`.
   - Optional `opts.includeTables` copies `knowledge_tables/` too (default false — user versions tables manually as separate files).
   - Refuses: unknown client/unit, empty unit (nothing to snapshot). Never overwrites an existing stamp dir.
   - `listSnapshots(vaultPath, client, unitName?) → [{unit, stamp, fileCount, note?}]` reading `_versions/`.
   - Everything under `_versions/` is committed (normal git auto-commit flow) — that IS the durability story. `_versions/` must be lint-exempt in `doctor-agent-ops.ts` (like `_randoms/`) and excluded from the fleet scanner's unit discovery (`agent-ops.ts` — make sure `_versions` doesn't parse as a pipeline/agent/stage).
2. **CLI:** `loredex snapshot <client> <unit> [--tables] [--note "..."]` + `loredex snapshot --list <client> [unit]` in a new `src/commands/snapshot.ts`, registered in `cli.ts`. Agent-ops dexes only (refuse on research, same as `new`).
3. **MCP tool `dex_snapshot`** in `src/mcp/server.ts`: params `{client, unit, includeTables?, note?}`, returns the manifest. **Append-only tool registration** — do not touch existing tool names/enums (snapshot back-compat test exists). Also `dex_snapshot_list`.
4. **Docs:** section in `docs/DEX-SPEC.md` (layout of `_versions/`, committed-not-generated, naming). lib.ts exports.

### Desktop

5. **Engine + IPC:** `engine.ts` gains `snapshotUnit`/`listSnapshots` wrappers (engine is the only loredex import — keep the fence). New channels `clients.snapshot.create` `{client, unit, tables?, note?}` and `clients.snapshot.list` `{client}` in `ipc-contract.ts` + `handlers.ts`. Create passes a timestamp from the main process.
6. **ClientPage UI:** per-pipeline/agent card gets a **"Snapshot" Button** → small Modal (optional note, "include knowledge tables" checkbox) → create → toast with stamp. New **"Versions" section** on ClientPage: list from `clients.snapshot.list` grouped by unit, newest first, each row `stamp · N files · note`; clicking a row expands the file list; clicking a file opens it read-only in the existing reader (md → note view, yaml/csv → DataFileView — paths are inside the dex so `vault.readRaw` containment already covers them).
7. **Skip for now** (note in plan doc, don't build): diff-vs-current view, restore-from-snapshot, git-log-based timeline. Snapshot+browse covers the user's ask; git history remains the deep archive.

**Tests:** core — snapshot golden test (pipeline w/ 2 stages → exact file set + manifest), agent unit, refuse cases, `_versions` invisible to scanFleet/doctor; desktop — handler test + ClientPage section render; MCP — tool registered, existing-tools snapshot unchanged.

---

## WP-D — Client credentials (username + password) on ClientPage

**User words: "client details include the username and password."** Platform logins for client tools — NOT MCP tokens (those are done).

1. **Store:** extend `src/core/client-tokens.ts` pattern with a parallel module `src/core/client-credentials.ts` (desktop repo): entries keyed `credRef = <clientSlug>/<credId>`, value JSON `{label, username, secret, url?, note?}` stored via the same macOS Keychain path (new service name `loredex-client-creds`) with the same AES-256-GCM file fallback. Reuse/extract the shared keychain read/write helpers from client-tokens.ts rather than copying.
2. **Index without secrets:** the list of credential ids/labels/usernames per client must be enumerable without touching the keychain per-row. Keep a non-secret index in the app's meta/settings table (NOT in the dex — credentials never touch git, and other machines simply won't have them; show "stored on this Mac" hint in UI).
3. **IPC:** `clients.credentials.list` `{client} → [{id,label,username,url?}]`, `.set` `{client,id?,label,username,secret,url?,note?}`, `.delete` `{client,id}`, `.reveal` `{client,id} → {secret}`. Reveal is a separate explicit call — never returned by list.
4. **ClientPage "Credentials" card** (near the existing MCP tooling card): rows `label · username · ••••••` with **Copy Username**, **Copy Password** (copies without revealing; clear clipboard is OS-level, don't over-engineer), **Reveal** (toggles masked→plain for that row until collapsed), **Edit**, **Delete** (confirm). **"Add Credential" Button** → Modal with label/username/password/url/note fields.
5. **Secret-scan guard:** doctor's `scanForSecrets` already polices the dex; nothing new needed — but add a test asserting credentials never land in any file under the dex path.

**Tests:** round-trip store/reveal/delete with file-fallback backend; list contains no secret material; ClientPage card render.

---

## WP-E — Auto-push (background, no manual git ever)

**User words: "saved to GitHub automatically without me running git push/pull."**

Current: every write auto-commits; pull+integration runs via poller; **push only happens on `sync.run` ("Sync now") or incidentally**. Close the loop:

1. **Push-when-ahead in the poller** (`src/core/poller.ts` — tick/integrate area, and the sync lib entry `sync.run` at `ipc-contract.ts:432-433`): after a tick where the repo is clean and `ahead > 0`, run the push half of the existing sync path (same lock, same credential env from `git.ts gitCredentialEnv`). Debounce: don't push on every keystroke-commit — push when ahead>0 AND last local commit is older than ~30s, or on poller cadence, whichever the existing tick structure makes natural. Reuse existing machinery; do not write a second git pipeline.
2. **Failure tolerance:** push failure (offline, auth) must be silent-retry-next-tick, never a modal. Surface state passively: the existing sync-health pill/`sync.status` gains `unpushed: n` and shows "N unpushed" when ahead>0 for more than a few minutes.
3. **Identity:** pushes run under the signed-in user's identity/token exactly as `sync.run` does today (`withGitIdentity`, credential token). No new auth surface.
4. **Do NOT** auto-push from CLI/core for terminal users — this is a desktop-app behavior (app = managed experience; CLI keeps explicit git).

**Tests:** poller unit — ahead>0 & clean → push invoked once (mock gitAsync), failure → retried next tick, behind>0 keeps existing integrate-first order; sync.status exposes unpushed count.

---

## WP-F — Open in Finder / open with OS app (reader + tree)

**User words: "click a folder → open it in Finder (Mac) / Explorer (Windows) / Linux equivalent; unsupported files (Excel etc.) → open the containing folder or open with the OS app."**

1. **IPC:** new channels `shell.revealPath` `{path}` (Electron `shell.showItemInFolder`) and `shell.openPath` `{path} → {error?}` (Electron `shell.openPath`, returns error string on failure). Main-side containment guard identical to `vault.readRaw`'s realpath check: path must resolve inside the active dex root — reject anything else. No ext allowlist for reveal; for openPath keep a **denylist of executables** (`.sh .command .app .exe .bat .cmd`) → reveal instead of launch.
2. **Tree (VaultTree):** context/row affordance on every folder row — "Reveal in Finder" (label per platform: Finder / Explorer / Files; `process.platform` exposed via existing env info or a tiny `app.platform` channel if absent). Keep it out of the primary click path — secondary button or context menu.
3. **Unsupported files in tree:** extend `walkVault`'s dataFiles mode to also LIST unsupported-but-relevant extensions (`.xlsx .xls .docx .pdf .png .jpg`) as tree nodes with a distinct glyph. Clicking one does NOT open the reader — it triggers `shell.openPath` (OS default app: Excel for xlsx, etc.). Failure → toast + reveal folder fallback.
4. **Reader fallback view:** if an unsupported file is ever routed to the reader (deep link), render a placeholder panel: filename, size, "Open in Default App" Button + "Reveal in Folder" Button — instead of an error.
5. **ClientPage:** knowledge_tables section header gets a "Reveal Folder" Button (opens `projects/<client>/knowledge_tables/` in Finder) — this is the user's stated workflow for dropping versioned Excel/CSV files.
6. **Perf guard:** tree walk budget (250ms) must hold with the extra extensions — extensions are a filename check, should be free, but run the perf test.

**Tests:** containment (path outside dex → rejected; symlink escape → rejected), denylist, tree includes xlsx node in agent-ops mode + NOT in research mode, reader fallback render.

---

## WP-G — Terminal-work reduction sweep (fills remaining gaps)

Everything a manager currently needs the terminal for, moved in-app. Small items, one PR:

1. **New Pipeline / New Agent / New Stage buttons** on ClientPage → Modals → engine wrappers around core scaffolds (`scaffoldPipeline/Agent/Stage` are lib-exported). Stage modal supports position (end / before NN / after NN) — renumbering handled by core (git-mv aware). New IPC `clients.scaffold.{pipeline,agent,stage}`.
2. **Edit-in-app is already covered** (NoteEditor for md, DataFileView read-only for data files) — make yaml/csv **editable** ONLY if trivial with existing CM6 setup; otherwise skip (files open via WP-F in OS apps; note the skip).
3. **Inbox actions:** `_inbox/` items on ClientPage get "Move to Randoms" and "Delete" row actions (IPC wrapping fs move + auto-commit path). Consuming inbox currently requires terminal.
4. Audit after A–F: list any remaining terminal-only flow in the PR description rather than speculatively building.

---

## Ordering & choreography

1. **Commit/land the in-flight `feat/add-client-flow` work first** (conversation history dropdown) — everything in WP-A/B touches the same files.
2. **Core PR (loredex):** WP-C core half (snapshot lib + CLI + MCP tool + spec + `_versions` exemptions). Release as the next agentops prerelease; refresh the vendored tarball + pin + `pinned-release.test.ts` in the same desktop commit.
3. **Desktop PRs in order:** WP-A (client-scoped chat) → WP-E (auto-push) → WP-C desktop half (snapshot UI) → WP-D (credentials) → WP-F (OS open) → WP-B polish → WP-G sweep. A, E, D, F are mutually independent — parallelize if multiple sessions.
4. Per-PR gates: `lint + typecheck + test` (core), `typecheck + test + test:e2e` (desktop, e2e sequential; known git-heavy flakes — receipts/route-safety/perf poller-tick pass isolated). Design-fidelity tests must pass for all new UI.
5. Release: desktop minor bump once A+C+E land (they're the user-visible headline); rest can trail in patches.

## Risks / gotchas (learned the hard way — do not rediscover)

- Engine is a singleton; agent-ops e2e must run in the sequential config.
- `vault_store`/MCP enums are append-only (snapshot back-compat test).
- Slugify client/pipeline args before path resolution (underscore vs hyphen).
- Full vitest suite dirties vault fixtures in loredex-desktop — flaky pre-existing failures; run targeted suites, confirm flakes isolated.
- gh CLI account flips: `gh auth switch --user ahmedtawfeeq1` before pushing, switch back after.
- Keychain code paths need the file-fallback tested in CI (no keychain on runners).
- `_versions/` MUST be invisible to scanFleet/doctor/route targets or every snapshot triggers lints and pollutes the fleet view.
- Never put credentials or tokens anywhere under the dex path — keychain + app meta table only.
