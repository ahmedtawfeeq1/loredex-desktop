# Loredex Desktop Product Requirements Document (PRD)

**Author:** John (Product Manager) · **Dialect:** BMAD V4 anatomy (stories `Draft/Approved/InProgress/Review/Done`) with a V6 `sprint-status.yaml` board

## Goals and Background Context

### Goals

- Make Obsidian unnecessary: every persona can read, navigate, search, and act on the vault from the app.
- Kill sender blindness (F1): consume carries identity + timestamp; senders are notified within one fetch cadence.
- Make routing safe (F4): every route has a receipt and an undo; nothing routes without consent rules.
- Fix rollout day one (F6/F7/F8): one engine serving UI and MCP, wizard-driven join/create, loud sync health.
- Ship a signed, notarized, auto-updating arm64 macOS app a solo maintainer can release unattended.

### Background Context

The Nimbus simulation proved the loredex pipeline works but its human surface does not: senders never learn the fate of handoffs, auto-routing damaged the vault, MCP and CLI served different vaults in one session, and onboarding took 6–10 manual steps per engineer with silent failure modes. The approved BUILD-PLAN decides the fix — an Electron app embedding the pinned `loredex` library in a Node `utilityProcess` as the team's single engine, with team-truth in vault frontmatter and per-user state in app-local SQLite. This PRD covers **M0 (walking skeleton) and M1 (the MVP cut line) only**; M2/M3 features (full lifecycle vocabulary, threading, OAuth repo creation, contract intelligence) are explicitly out of scope for v1.

### Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 1.0 | Initial PRD from brief + BUILD-PLAN; M0+M1 scope | John (PM) |

## Personas

| Persona | Simulation role | Core need |
|---|---|---|
| Engineer (AI-engine / frontend) | Sent and consumed handoffs in 3-team chains | Fate of what I sent; read what I received without terminal archaeology |
| Integrations engineer (backend) | Owned openapi.yaml/Postman; 3 contract mutations in a day | Route safety for working files; git health visible |
| Mobile dev | First consumer of a handoff | Read-mostly consumption, push-style awareness |
| PM | Reconstructed the product picture from the vault alone | Board, search, product home, activity feed — no Obsidian, no git |
| DevOps / admin | Stood up 4 repos + vault + remote for ~12 engineers | One-click create/join, sync health, registry as shared truth |

## Requirements

### Functional

- **FR1:** The app renders any vault markdown note read-only with GFM formatting and a frontmatter metadata panel; `[[wikilinks]]` are clickable, resolved via the Obsidian shortest-path algorithm, disambiguated by project on collision, with hover previews; broken links render as diagnostics and are never auto-created.
- **FR2:** Full-text search across the vault with frontmatter facet filters (project, topic, type, status, from/to project), available from a search view and a Cmd+K palette.
- **FR3:** A product home renders the Start Here brief with commit SHAs hyperlinked, a freshness badge, one-click re-curate, and a "changed since last brief" diff computed from watcher snapshots.
- **FR4:** Every route (manual or watcher) produces a receipt — file → exact destination plus invented-frontmatter diff — with one-click undo; content-hash dedupe reconciles watcher/manual races with one-click merge.
- **FR5:** Filing scope control: never-route globs per project, and explicit confirmation before routing any frontmatter-less file.
- **FR6:** Drift badges: stamped-but-edited sources show "vault copy N commits behind source" with one-click re-route, and a per-note local-vs-pushed indicator.
- **FR7:** A handoff inbox + outbox board per project with from/to, objective, age, and status chips; a company-wide view; one-click open of the brief with reading-order notes resolved inline.
- **FR8:** Consume records identity + timestamp in handoff frontmatter via the shared lib export, shows the sender what changed, and ships the `loredex_schema:` version key plus `.loredex/engine.json` with it.
- **FR9:** A native macOS notification fires when a new handoff arrives for the user's projects; clicking it opens the handoff.
- **FR10:** The sender is notified when a sent handoff's state changes (e.g. consumed, with who/when), within one fetch cadence (≤ 2 min focused).
- **FR11:** A create-or-join vault wizard: join via link/deep link (`loredex://join`) encoding remote, branch, and registry, with batch-registration of local repos; create scaffolds a vault and connects an **existing** GitHub repo by pasted URL + canonical branch + push. No OAuth anywhere in v1.
- **FR12:** A shared project registry stored in the vault replaces per-machine `config.json` as truth (coordinated loredex-core release with CLI migration), rendered as a company overview.
- **FR13:** A sync health panel: remote reachable, branch match, ahead/behind, last push/pull, merge-driver status, and every surfaced git warning — nothing swallowed.
- **FR14:** An always-visible vault identity badge (vault path, config source, remote) in the app chrome, echoed in MCP tool responses.
- **FR15:** A team activity feed of typed, identity-attributed events (route/consume/handoff/sync) parsed from the vault git log, with day headers and avatars.
- **FR16:** The app hosts the loredex Streamable-HTTP MCP server in-process (127.0.0.1 + bearer token), publishes `~/.loredex/desktop.json` `{port, token, engineVersion, schemaVersion}`, and the CLI gains `loredex mcp --via-desktop` (stdio proxy) plus `loredex doctor` discovery/handshake checks.
- **FR17:** A remote-event poller runs `git fetch` every 60 s (focused) / 5 min (background), parses notification events from `origin/<branch>` without merging, and integrates (`git pull`) only when the core-host write lock is free and the tree is clean, reconciling from filesystem + git truth afterward.
- **FR18:** Per-user read/unread state, notification log, and snoozes live in app-local SQLite (`app.db`), opened only by the core host; deleting it loses read-state only.
- **FR19:** Auto-update via electron-updater against GitHub Releases with stable and beta channels and App Translocation detection.

### Non Functional

- **NFR1:** macOS 14+ (Sonoma), Apple Silicon arm64 only; no Intel/universal2 builds.
- **NFR2:** Cold start ≤ 2 s on M1 Air; idle RAM ≤ 450 MB with tray active.
- **NFR3:** Every release is Developer ID signed, hardened-runtime, notarized ("Accepted" asserted on status text), and stapled; `spctl -a` passes on artifacts.
- **NFR4:** Renderer runs sandboxed with contextIsolation; it never accesses `fs`, `child_process`, or SQLite — all data flows through the typed IPC seam.
- **NFR5:** The MCP server binds `127.0.0.1` only, validates `Origin`, requires a per-install bearer token; the discovery file is chmod 600.
- **NFR6:** Anti-second-engine rule: any operation that writes vault markdown/frontmatter is a loredex lib export shared with the CLI; app-side code is read-only view logic or non-vault I/O only.
- **NFR7:** State placement rule: nothing the team needs to see lives only in `app.db`; nothing per-user lives in the vault.
- **NFR8:** Every engine vault write carries `loredex_schema: <n>`; app, CLI, and vault versions are handshaked via the discovery file and `.loredex/engine.json`, warning loudly on material mismatch.
- **NFR9:** Blocking work (curate spawns, slow git) never runs in main or renderer; a core-host crash respawns without closing windows.
- **NFR10:** Telemetry is opt-in crash reports only (paths/hostnames scrubbed); never routed through the vault.
- **NFR11:** In-app git writes inject identity per command (`git -c user.name/-c user.email`), never ambient global config.
- **NFR12:** Folder access is granted only via the native open panel (no cold scans, no Full Disk Access, no TCC ambush).
- **NFR13:** Every test layer in the architecture's testing strategy has a CI gate from M0 onward.

## Epic List (M0 + M1 only)

- **Epic 1 — Walking Skeleton (M0):** signed, notarized, auto-updating arm64 app shell with three-process topology, embedded pinned loredex, one rendered note + vault identity badge (canary), in-app MCP server + discovery + stdio proxy.
- **Epic 2 — Vault Reader & Product Home:** rendered browser with resolved wikilinks, live refresh, faceted search, Start Here home with re-curate and changed-since diff. *(FR1–FR3)*
- **Epic 3 — Handoff Inbox/Outbox, Consume & Notifications:** board, consume with identity (+ schema versioning), remote-event poller, read-state store, native notifications. *(FR7–FR10, FR17, FR18)*
- **Epic 4 — Routing Safety:** route receipts + undo + dedupe, never-route globs, frontmatter-less confirm, drift badges. *(FR4–FR6)*
- **Epic 5 — Onboarding, Registry & Sync Health:** sync status + health panel, registry-in-vault loredex release, join/create wizard. *(FR11–FR13)*
- **Epic 6 — Activity Feed & MVP Hardening:** shared activity-event grammar, feed UI, and the automated Nimbus E2E suite that is M1's Definition of Done. *(FR15)*

Sequencing note: loredex library PRs are stories inside the epic that consumes them, ordered before their consuming app stories (BUILD-PLAN §3.2 work-plan). Epic 1 satisfies the BMAD rule that Epic 1 establishes infrastructure plus a canary feature.

## Epic 1 — Walking Skeleton (M0)

Goal: a fresh Mac can install a signed DMG, open a vault, read one note with a vault identity badge, and Claude Code can query the in-app MCP server through the discovery file — one engine, one vault, provably.

### Story 1.1: App scaffold & three-process topology

As a maintainer, I want a scaffolded Electron app with the decided three-process topology and a CI build, so that every later story lands on working infrastructure.

**Acceptance Criteria:**
1. Repo scaffolded with electron-vite + TypeScript + electron-builder targeting macOS arm64; `npm run dev` opens a window.
2. Main process forks a core host via `utilityProcess.fork` at startup and brokers a `MessagePortMain` pair to the renderer; a ping message round-trips renderer → core host → renderer.
3. Renderer runs with `sandbox: true` and `contextIsolation: true`; Node integration disabled.
4. A core-host crash triggers respawn and port re-brokering without closing the window.
5. GitHub Actions on `macos-latest` (arm64) builds an unsigned DMG artifact on every PR; vitest is wired with at least one passing unit test.
6. Repo is public with MIT license and README stub.

### Story 1.2: Typed IPC seam

As a developer agent, I want a single typed IPC contract with generic wrappers, so that all renderer↔core traffic is compile-time checked.

**Acceptance Criteria:**
1. `src/shared/ipc-contract.ts` defines the `CoreApi` map and `CoreEvent` union exactly as the architecture's IPC contract (unimplemented channels may return a typed NotImplemented error).
2. Generic `invoke<K>()` (request/response) and `onEvent()` (push) wrappers exist on both sides — renderer `src/renderer/src/api.ts`, core host dispatcher `src/core/ipc.ts` — with payload types enforced at compile time.
3. The preload script exposes only the bridge (`window.loredex`) via `contextBridge`; nothing else.
4. Unknown channels or malformed payloads produce a typed error envelope, never a crash.
5. Unit tests cover request/response round-trip, error envelope, and event fan-out.

### Story 1.3: Core host embeds pinned loredex

As a maintainer, I want the core host to import the pinned loredex library and serve config/read/search over IPC, so that one in-process engine serves the app (F6 fixed by construction).

**Acceptance Criteria:**
1. `loredex` is an exact-version pinned dependency; the core host `import`s it directly (no CLI shell-outs for these operations).
2. Config is resolved exactly once at core-host startup; `config.get` returns the resolved `Config` over IPC.
3. `vault.readNote` returns a parsed `Doc` using `parseDoc` + `resolveNoteInsideVault`; paths outside the vault are rejected.
4. `vault.search` proxies `searchVault` and returns `SearchHit[]`.
5. An automated check verifies the pinned release contains the F8 gitattributes fix and the F6 npx-footer fix (quoted pattern in router output; project-local footer in handoff briefs).

### Story 1.4: Vault picker, first rendered note & identity badge

As a user, I want to open my vault and read a rendered note with an always-visible vault identity badge, so that I can verify the app serves the vault I chose.

**Acceptance Criteria:**
1. "Open Vault" uses the native open panel (main process) so folder access is granted without extra TCC prompts; the choice persists across restarts.
2. A selected markdown note renders (frontmatter panel + body) in a minimal reader view.
3. A persistent chrome badge shows vault path, config source, and remote, visible in every view (FR14).
4. The app never cold-scans directories outside the selected vault.

### Story 1.5: loredex PR-5 + PR-8 — async git & injectable events (loredex repo)

As the desktop core host, I want async git variants with a structured SyncReport and an injectable event emitter in loredex, so that slow git operations don't serialize the engine and the app can observe engine events.

**Acceptance Criteria:**
1. loredex exposes async variants of the `core/router.ts` git calls; the async sync path returns a structured, exported `SyncReport`.
2. loredex accepts an injectable typed event emitter; lib operations emit route/consume/store/sync events; the default emitter is a no-op so CLI behavior is unchanged.
3. Both changes carry unit tests in the loredex repo and pass its regression suite.
4. A loredex release is published and the desktop repo bumps its exact pin.

### Story 1.6: In-app MCP server & discovery file

As a CLI/agent user, I want the app to host the loredex MCP server with a discovery file, so that MCP traffic and the UI provably share one engine and one vault.

**Acceptance Criteria:**
1. The core host hosts `createLoredexMcpServer` over Streamable HTTP bound to `127.0.0.1` only, ported from loredex-obsidian's `LoredexHttpServer`.
2. Requests are validated: `Origin` check plus per-install bearer token.
3. The app claims preferred port 52017; if taken it does **not** silently fall back — it emits a loud sync-health error with a settings override, and whatever port is bound is what the discovery file records.
4. `~/.loredex/desktop.json` is written chmod 600 with `{port, token, engineVersion, schemaVersion}` and removed on clean shutdown.
5. MCP tool responses echo the vault identity (FR14).
6. An MCP query from a local client returns results from the same vault the UI shows.

### Story 1.7: loredex PR-9 + PR-10 — stdio proxy & doctor checks (loredex repo)

As a CLI/agent user, I want `loredex mcp --via-desktop` and doctor handshake checks, so that static `.mcp.json` configs reach the app's MCP server and version skew is caught loudly.

**Acceptance Criteria:**
1. `loredex mcp --via-desktop` is a stdio↔HTTP proxy that reads `~/.loredex/desktop.json` at spawn and forwards MCP traffic with the bearer token.
2. When the app isn't running or the token is stale, the proxy exits loudly with a `loredex doctor` hint.
3. `loredex doctor` validates the discovery file and compares engine/schema versions (CLI vs app vs vault), warning on material mismatch.
4. The desktop repo gains the MCP contract test: spawn the real core host, connect via `--via-desktop`, and assert tool list/results parity with the CLI's stdio server against a fixture vault (the F6 regression net), gated on every PR.

### Story 1.8: Signed, notarized release pipeline

As a maintainer, I want a CI pipeline that signs, notarizes, staples, and publishes release artifacts unattended, so that every release passes Gatekeeper on a clean Mac.

**Acceptance Criteria:**
1. Release workflow creates an ephemeral keychain from a base64 .p12 (including `security set-key-partition-list`), signs inside-out with Developer ID + hardened runtime, entitlements `allow-jit` only — never `--deep`.
2. Bundled dugite-native git binaries are individually signed before app signing.
3. `notarytool submit --wait` runs with a ≥ 20 min timeout; CI asserts on the "Accepted" status text, not the exit code; the app is stapled.
4. Artifacts are a DMG (drag-to-/Applications) and a ZIP produced via `ditto -c -k --keepParent`, uploaded to the GitHub Release with `latest-mac.yml`.
5. CI asserts `spctl -a` passes on the stapled artifact.
6. `legal/` third-party notices are generated during the build.
7. release-please + conventional commits drive tagging; the tag merge triggers the signed build.

### Story 1.9: Auto-update, beta channel & translocation guard

As a user, I want the app to update itself from GitHub Releases with an opt-in beta channel, so that a solo maintainer can ship fixes that actually reach users.

**Acceptance Criteria:**
1. electron-updater checks GitHub Releases; stable users consume `latest-mac.yml`.
2. An in-app setting flips `updater.channel` to `beta`; pre-releases publish `beta-mac.yml`; stable users never see pre-releases.
3. Launching from `/AppTranslocation/` is detected and prompts Move to Applications (otherwise self-update silently breaks).
4. An update-check smoke test runs in CI; the updater never deletes user data.

## Epic 2 — Vault Reader & Product Home

Goal: kill the Obsidian dependency (F9) — rendered notes, working wikilinks, live refresh, faceted search, and the Start Here brief as the app home with its daily delta.

### Story 2.1: Vault tree & note rendering

As a reader, I want a vault file tree and fully rendered notes, so that I can browse the vault without a terminal or Obsidian.

**Acceptance Criteria:**
1. A sidebar shows the vault's markdown files as a collapsible folder tree; `.git/**` and dotfiles are hidden.
2. Selecting a note renders GFM markdown through the sanctioned unified pipeline, sanitized, with the frontmatter shown as a metadata panel.
3. Rendering is strictly read-only — no edit affordances.
4. Notes up to 1 MB render without freezing the UI.

### Story 2.2: Wikilink resolution & diagnostics

As a reader, I want clickable, disambiguated wikilinks with hover previews, so that link-following never requires filesystem archaeology (F9).

**Acceptance Criteria:**
1. `[[wikilinks]]` resolve via the Obsidian shortest-path algorithm implemented in the core host (`vault.resolveLink`).
2. Cross-project name collisions are disambiguated: an ambiguous link opens a picker listing candidates with project context.
3. Hovering a resolved link shows a preview excerpt of the target note.
4. Broken links render in a distinct diagnostic style and appear in a diagnostics list — never auto-created.
5. Unit tests cover resolution, collision, and broken-link cases.

### Story 2.3: Vault watcher & live refresh

As a reader, I want the UI to reflect vault changes live, so that CLI/agent writes appear without restarting the app.

**Acceptance Criteria:**
1. The core host subscribes to the vault with `@parcel/watcher` (FSEvents), ignoring `.git/**`, with debounce.
2. `vault.changed` CoreEvents push changed paths; the open note and file tree refresh live.
3. After a `git pull` event storm, state is reconciled from filesystem + git truth — cached per-file events are never trusted (F4 rule).
4. CI gains a native-module smoke test: watcher subscribe/emit against the packaged Electron ABI, rerun on every Electron and module bump.

### Story 2.4: Faceted full-text search

As a PM, I want full-text search with frontmatter facets and a Cmd+K palette, so that ad-hoc questions never need grep (FR2).

**Acceptance Criteria:**
1. A search view and a Cmd+K palette both query `vault.search`.
2. Full-text results come from the lib's `searchVault`; facet filters (project, topic, type, status, from/to project) narrow by frontmatter.
3. Results show note title, project, and a highlighted snippet; Enter opens the note in the reader.
4. Search returns within 500 ms on a 1,000-note vault.

### Story 2.5: Product home — rendered Start Here

As a PM, I want the Start Here brief as the app home with linked SHAs, freshness, and one-click re-curate, so that the daily product picture needs no terminal (F5/F9).

**Acceptance Criteria:**
1. The home view renders the product brief via `buildDashboard`/`renderDashboardMarkdown`.
2. Commit SHAs in the brief render as hyperlinks to the owning remote.
3. A freshness badge shows the brief's age (last curate time).
4. One-click re-curate invokes `dashboard.build` in the core host; the UI stays responsive through a 40–60 s curate, with progress and failure surfaced.
5. Wikilinks inside the brief resolve per Story 2.2.

### Story 2.6: Changed-since-last-brief diff

As a PM, I want to see what changed since the last brief, so that the daily question is the delta, not a restatement.

**Acceptance Criteria:**
1. A watcher snapshot (`writeSnapshot`) is recorded after each successful curate; `getEventsSince` computes the delta on demand.
2. The home shows "changed since last brief" as added/modified/deleted note lists, each linked into the reader.
3. An empty state appears when nothing changed; snapshots survive app restarts.

## Epic 3 — Handoff Inbox/Outbox, Consume & Notifications

Goal: kill F1 — both lanes visible, consume attributed and versioned, and both directions notified within one fetch cadence.

### Story 3.1: loredex PR-1 — listHandoffs (loredex repo)

As the desktop app and the CLI, I want a generalized `listHandoffs(scope)` export, so that both surfaces share one handoff collector.

**Acceptance Criteria:**
1. loredex exports `listHandoffs(scope)` generalizing `collectProductHandoffs` to inbox/outbox/all, per-project and company-wide, returning an exported `HandoffCard[]` type.
2. The CLI's handoff listing is rewired onto the same export with unchanged output.
3. Unit tests in the loredex repo; a release is published and the desktop pin bumped.

### Story 3.2: Handoff inbox + outbox board

As an engineer, I want inbox and outbox lanes with status chips and one-click brief opening, so that both sides of every handoff are visible (F1/F5).

**Acceptance Criteria:**
1. A board view shows inbox and outbox lanes per project via `handoffs.list`; each card shows from/to, objective, age, and status chip.
2. A company-wide view aggregates all registered projects (the PM view).
3. Clicking a card opens the handoff brief rendered with reading-order notes resolved inline (Epic 2 reader).
4. The board handles empty/loading states and refreshes on `vault.changed`.

### Story 3.3: loredex PR-2 — consumeHandoff & schema versioning (loredex repo)

As the team, I want consume as a shared lib export that stamps identity, timestamp, and a schema version, so that app and CLI write identical, versioned frontmatter (FR8, NFR8).

**Acceptance Criteria:**
1. loredex exports `consumeHandoff(id, identity)` extracted from the CLI command into `core/`; the CLI is rewired onto it.
2. Consume writes who/when into the handoff frontmatter and returns an exported `ConsumeReceipt`.
3. Every engine vault write now stamps `loredex_schema: <n>`; scaffold/migration writes `.loredex/engine.json` `{minEngine, schema}`.
4. The lib and `loredex doctor` compare supported schema against the vault's declared schema and warn on mismatch.
5. Tests pass in the loredex repo; release published; desktop pin bumped.

### Story 3.4: In-app consume with identity

As a receiver, I want a consume button that records who/when and shows what changed, so that consumption is attributed and verifiable (F1).

**Acceptance Criteria:**
1. An app identity profile (name + email) is settable in Settings and stored app-side, never in the vault.
2. The consume button on an inbox card calls `handoffs.consume` with that identity; the frontmatter update happens via the lib export only.
3. A receipt UI shows exactly what changed and whether it pushed.
4. Git identity is injected per command via `-c user.name`/`-c user.email` — never ambient config (NFR11).
5. The board reflects the consumed state immediately.

### Story 3.5: Remote-event poller & write lock

As a sender, I want the app to notice remote vault commits safely, so that notifications arrive without racing concurrent writers (FR17, risk 12).

**Acceptance Criteria:**
1. The core host runs `git fetch` (never pull) every 60 s while a window is focused and every 5 min in background/tray.
2. Notification events are parsed from `git log ..origin/<branch>` on the fetched ref **without merging**, emitting typed CoreEvents (`handoff.new`, `handoff.stateChanged`).
3. A core-host write lock is taken by every lib write operation; the poller pulls only when the lock is free and the working tree clean, deferring otherwise while sync health shows "behind N, integrating…".
4. After every integrate, state is reconciled from filesystem + git truth and indexes regenerated (`rebuildIndexes`).
5. Unit tests cover lock gating and remote-log event parsing.

### Story 3.6: Per-user read-state store (app.db)

As a user, I want unread tracking that never touches the vault, so that per-user state stays out of team truth (FR18, NFR7).

**Acceptance Criteria:**
1. `app.db` (better-sqlite3) lives in the app's userData dir and is opened by the core host only; schema covers read-state, notification log, snoozes, and UI prefs.
2. The renderer reads/writes read-state exclusively via IPC calls.
3. Unread status is computed per handoff; deleting `app.db` loses read-state only — the vault is untouched.
4. The CI native-module smoke test covers better-sqlite3 against the packaged Electron ABI.

### Story 3.7: Native notifications & badge

As a receiver and a sender, I want native notifications for new handoffs and state changes plus an honest badge, so that nobody polls a command to learn their fate (FR9/FR10).

**Acceptance Criteria:**
1. A `handoff.new` event for one of my projects fires a native macOS notification; clicking it focuses the app and opens the handoff.
2. A state change on a handoff I sent (e.g. consumed with who/when) notifies me within one fetch cadence (≤ 2 min focused).
3. The dock/tray badge counts open inbound handoffs only (Things discipline); snoozes are respected.
4. Notifications are logged in `app.db`; bulk integrates produce one batched summary, never a storm.

## Epic 4 — Routing Safety

Goal: kill F4 — the only friction cluster that actively damaged the vault. Receipts, undo, consent, and drift visibility.

### Story 4.1: loredex PR-3 — route plan/apply, receipts & undo (loredex repo)

As the app and CLI, I want routing split into plan/apply with a persisted receipt and an undo, so that no route is ever silent or irreversible (FR4).

**Acceptance Criteria:**
1. loredex splits `routeNote` into plan and apply: plan returns an exported `RoutePreview` (exact destination, invented-frontmatter diff, content hash); apply returns a receipt with a stable id.
2. An undo export replays the receipt's inverse, including index regeneration; receipts are persisted under the vault's `.loredex/` directory so CLI and app share them.
3. The CLI is rewired onto the same exports with default behavior unchanged.
4. Tests in the loredex repo; release published; desktop pin bumped.

### Story 4.2: Route receipt UI, undo & dedupe merge

As an engineer, I want every route to show a receipt with undo and duplicate reconciliation, so that routing mistakes are recoverable in one click (F4).

**Acceptance Criteria:**
1. Every route (manual or watcher-triggered) surfaces a receipt card: file → exact destination plus the invented-frontmatter diff, driven by `route.preview` / `route.completed` events.
2. One-click undo calls `route.undo` and restores prior state, indexes included.
3. Content-hash dedupe detects watcher/manual race duplicates and offers a one-click merge — no hand-editing "do not edit" indexes.
4. A receipt history view lists recent routes with their outcomes.

### Story 4.3: Filing scope control

As an integrations engineer, I want never-route globs and a consent step for frontmatter-less files, so that internal scratch files can't be silently published (F4).

**Acceptance Criteria:**
1. Never-route globs are configurable per project, persisted via the lib's config (`saveConfig`) so the CLI honors them too.
2. Routing any frontmatter-less file requires explicit confirmation that shows the invented frontmatter before anything is written.
3. A blocked route (never-route match) shows a visible explanation — never a silent skip.

### Story 4.4: Drift badges & re-route

As a reader, I want to see when a vault copy is stale against its source, so that route-once staleness is visible instead of silent (F4).

**Acceptance Criteria:**
1. Stamped-but-edited source files show a "vault copy N commits behind source" badge, computed from read-only git queries.
2. One-click re-route refreshes the vault copy via the lib's route apply.
3. Each note shows a local-vs-pushed indicator (committed locally? pushed to remote?).
4. Badges update on watcher and poller events.

## Epic 5 — Onboarding, Registry & Sync Health

Goal: kill F6/F7/F8 for rollout day one — loud git health, registry as shared truth, and a wizard that replaces 6–10 manual steps.

### Story 5.1: loredex PR-4 — syncStatus (loredex repo)

As the app and CLI, I want a read-only `syncStatus()` export, so that sync health has one authoritative source.

**Acceptance Criteria:**
1. loredex exports `syncStatus()`: ahead/behind counts, branch/remote match, merge-driver status, and collected warnings — read-only git queries only.
2. The exported `SyncHealth` type is the IPC contract's payload type.
3. Tests in the loredex repo; release published; desktop pin bumped.

### Story 5.2: Sync health panel

As a DevOps admin, I want a panel that surfaces every git truth and warning, so that failures like the gitattributes bug are caught on day one (F8, FR13).

**Acceptance Criteria:**
1. The panel shows remote reachable, branch match, ahead/behind, last push/pull, and merge-driver status via `sync.status`.
2. Every git stderr warning from any engine operation is surfaced as `git.warning` events and listed in the panel — nothing swallowed.
3. A sync-now button runs `sync.run`; the structured `SyncReport` renders per-operation results.
4. Engine/schema handshake mismatches (app vs CLI vs vault) warn loudly here (NFR8).
5. The MCP port-conflict error (Story 1.6) appears here with a settings override.

### Story 5.3: loredex PR-7a — registry-in-vault library core (loredex repo)

As a team, I want the project registry stored in the vault as truth, so that a fresh clone is a live vault, not a dead one (F7, FR12).

**Acceptance Criteria:**
1. The vault carries a shared project registry (member repos, registrants, last sync per teammate); lib config resolution reads it as the source of truth.
2. Registry reads/writes are lib exports; `scaffoldVault` writes an initial registry.
3. Vaults without a registry still resolve via `config.json` (compatibility until PR-7b migration).
4. Tests in the loredex repo; coordinated release notes document the rollout.

### Story 5.4: loredex PR-7b — CLI registry migration (loredex repo)

As a CLI user, I want registration to flow through the vault registry with automatic migration, so that status and doctor stop disagreeing (F7).

**Acceptance Criteria:**
1. CLI commands register and resolve via the vault registry; existing `config.json` state migrates on first run, idempotently.
2. `loredex doctor` validates registry consistency; status/doctor agree on registered repos.
3. The loredex regression suite passes; release published; desktop pin bumped.

### Story 5.5: Join wizard & deep link

As an engineer joining a team, I want to join a vault from a single link, so that onboarding takes minutes with zero git commands (F7, FR11).

**Acceptance Criteria:**
1. The `loredex://join?...` deep link (registered by the main process) encodes remote URL, branch, and registry, opening the wizard pre-filled; a paste-the-link path exists too.
2. Join clones the vault, registers this machine, and batch-registers local repos by scanning a user-picked parent folder (native picker — no cold scans).
3. The flow completes with zero manual git commands; the canonical branch comes from the link, so master/main mismatch is impossible by construction.
4. Failure states (unreachable remote, auth failure) surface actionable messages.
5. On completion the reader and board are immediately live against the joined vault.

### Story 5.6: Create wizard (pasted repo URL)

As a DevOps admin, I want to create a vault and connect an existing GitHub repo in one flow, so that team setup replaces the manual bare-repo dance (F7, FR11).

**Acceptance Criteria:**
1. Create scaffolds a vault via the lib (`scaffoldVault` + registry init from PR-7a).
2. The flow connects an existing GitHub repo by pasted URL, sets the canonical branch, and performs the initial push.
3. It ends by generating the shareable join link/deep link.
4. No OAuth anywhere (11b is M2).
5. Errors (non-empty repo, auth failure, branch mismatch) surface actionable messages.

### Story 5.7: Registry company overview

As a PM, I want a company overview of the registry, so that membership and sync recency are visible instead of per-machine folklore (FR12).

**Acceptance Criteria:**
1. An overview view renders the vault registry: member repos, registrants, and last sync per teammate.
2. Data comes from the core host reading the registry via lib exports, refreshing on `vault.changed` and poller integrates.
3. The overview links into sync health and the board.

## Epic 6 — Activity Feed & MVP Hardening

Goal: give PM/DevOps their first real surface (FR15) and make M1's Definition of Done executable.

### Story 6.1: loredex PR-6 — activity event grammar (loredex repo)

As the app and CLI, I want one shared activity-event grammar parsed from git history, so that both surfaces describe vault activity identically (FR15).

**Acceptance Criteria:**
1. loredex exports `parseActivity(gitLog)` producing typed, identity-attributed events (route/consume/handoff/sync) from vault git history — read-only.
2. The exported `ActivityEvent` type is the IPC contract's payload type.
3. Tests in the loredex repo; release published; desktop pin bumped.

### Story 6.2: Activity feed view

As a PM, I want a chronological, attributed activity feed, so that "who routed/synced/consumed what" needs no `git log` (FR15).

**Acceptance Criteria:**
1. A feed view calls `activity.feed {since}` and renders events chronologically with day headers and identity avatars (initials).
2. Clicking an event navigates to the related note or handoff.
3. The feed loads incrementally and updates after poller integrates.

### Story 6.3: E2E Nimbus reproduction suite

As the maintainer, I want the Nimbus friction reproductions automated end-to-end, so that M1's Definition of Done is executable, not ceremonial.

**Acceptance Criteria:**
1. A Playwright-for-Electron suite scripts the F1, F4, F6, F7, F8, and F9 reproduction steps from the simulation against a fixture vault; each reproduction must FAIL to reproduce.
2. The suite includes the wizard join flow and an update-check smoke.
3. It runs nightly and on every release, and is documented in the README/CI docs.
4. The full simulation re-run passes with zero Obsidian installs and zero terminal commands for reading/consuming.

## Out of Scope (v1)

Features 11b and 16–37 of the BUILD-PLAN feature table (OAuth repo creation, lifecycle vocabulary beyond open/consumed, threading, chain/dependency views, commit/PR chips, managed identity profiles, scope preview, target picker, sync transparency, wiring commit, contract intelligence, and all "could" items), note editing, Android companion, Windows/Linux/Intel, usage telemetry, Mac App Store.
