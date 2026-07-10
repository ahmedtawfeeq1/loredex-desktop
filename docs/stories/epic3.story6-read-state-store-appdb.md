# Story 3.6: App-db — read-state, snooze timers & per-user store (M2-upgraded — board id 9.2)

## Status

Done

## Story

**As a** user,
**I want** unread tracking, snooze timers, and app settings that never touch the vault,
**so that** per-user state stays out of team truth (FR18, NFR7).

## Acceptance Criteria

1. `app.db` (better-sqlite3, WAL) lives at `<userData>/app.db` (main passes `app.getPath('userData')` at fork) and is opened by the core host ONLY; migrations run via `PRAGMA user_version` + an ordered array of idempotent functions in one transaction — no ORM, no down-migrations; `app.db` is disposable by contract.
2. The M2 schema ships exactly: `meta`, `read_state (vault_id, note_path, read_at)`, `snooze_timers (vault_id, handoff_id, until, notified)`, `poll_cursor`, `contract_scan`, `app_settings` — every table keyed on `vault_id` (normalized origin remote URL, else absolute vault path, computed once at vault open).
3. The v0.1 userData-JSON shim for identity/settings is migrated: read the JSON once, import into `meta`/`app_settings`, rename to `.bak`; the renderer reads/writes read-state exclusively via `readState.get {paths}` / `readState.mark {paths}` IPC.
4. `snooze_timers` is a LOCAL mirror of vault `snoozed_until` so expiry fires a toast once per machine (`notified` flag); the vault is authoritative — timers reconcile from frontmatter on every board load and after every poller integrate; a core-tick sweep emits `snooze.expired {handoffId}` for due, un-notified timers.
5. Unread status is computed per handoff from `read_state`; deleting `app.db` loses read-state only — the vault is untouched; startup recreates a missing/corrupt db fresh (log, don't crash).
6. The CI native-module smoke test covers better-sqlite3 against the packaged Electron ABI.

## Tasks / Subtasks

- [x] DB layer + migrations (AC: 1, 2)
  - [x] `npm i -E better-sqlite3` (12.x); `src/core/db/index.ts`: the ONLY `new Database()` call site; WAL; `migrations: Array<(db) => void>`, run `migrations.slice(user_version)` in one transaction, bump
  - [x] Migration 1 creates the six M2 tables verbatim from architecture-m2.md §3; `vault_id` helper (normalized remote URL || absolute path) computed once at vault open
- [x] JSON shim migration (AC: 3)
  - [x] Import identity profile + settings JSON (Stories 1.4/3.4) into `meta`/`app_settings`; rename source to `.bak`; idempotent
- [x] IPC surface (AC: 3, 5)
  - [x] Contract channels `readState.get {paths: string[]} → Record<path, read_at | null>` and `readState.mark {paths: string[]} → void`; board renders unread dots; opening a handoff marks read
- [x] Snooze timers (AC: 4)
  - [x] `src/core/db/snooze.ts`: upsert from frontmatter (board load + post-integrate reconcile); sweep on poller tick → `snooze.expired` once (`notified = 1`)
- [x] Disposability + native smoke (AC: 5, 6)
  - [x] Corrupt/missing-db recovery; extend `tests/native-smoke/` with better-sqlite3 open/write/read (same CI job as the watcher smoke)

## Dev Notes

- State-placement rule is the whole story: nothing team-visible lives only here; nothing per-user goes to the vault. `snooze_timers` duplicates a *vault* fact purely to fire local notifications — vault is authoritative, timers reconcile from frontmatter. [Source: architecture-m2.md#3-app-db] [Source: architecture-m2.md#8-ipc-additions]
- The M2 schema (six tables, `vault_id` scoping, `PRAGMA user_version` migrations) SUPERSEDES this story's original v0.1 table sketch (`item_id`-keyed read_state, `notification_log`, `prefs`) — implement §3 verbatim. Notification logging, if kept from Story 3.7, becomes a `meta`/`app_settings` concern, not its own table. [Source: architecture-m2.md#3-app-db]
- Core host is the sole SQLite opener; renderer access is IPC-only (sandbox + one-writer discipline). better-sqlite3 is synchronous — fine in the core host, prepared + short statements; never in main or renderer. ABI churn is risk 5 → the smoke test. [Source: architecture.md#process-model] [Source: architecture.md#tech-stack]
- `poll_cursor` and `contract_scan` tables are created here; their read/write logic belongs to Stories 3.5/9.1 and 11.1 respectively — this story ships the schema + db module they call.
- `snooze.expired` is a CoreEvent consumed by notification routing (Story 2.3/9.3): the toast + resort, never an auto status write. [Source: architecture-m2.md#8-ipc-additions] [Source: architecture-m2.md#1-handoff-schema-v2]
- Files: `src/core/db/index.ts`, `src/core/db/read-state.ts`, `src/core/db/snooze.ts`, `src/shared/ipc-contract.ts`, `src/core/ipc.ts`, `src/renderer/src/stores/handoffs.ts` (unread), `tests/native-smoke/sqlite.test.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: migrations idempotent (run twice = same schema), vault_id normalization matrix (ssh/https/no-remote), read-state round-trip, JSON-shim import idempotence, snooze sweep fires once, corrupt-db recovery. Native smoke in CI. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 3 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |
| 2026-07-10 | 2.0 | M2 upgrade (board id 9.2): §3 schema verbatim (six tables, vault_id scoping, user_version migrations), JSON-shim import→.bak, snooze_timers mirror + snooze.expired sweep, readState.get/mark channel shapes — per architecture-m2.md §3/§8 | Bob (SM) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `npm run typecheck` clean; `npm test` 36 files / 222 tests green (includes new db suite: migrations idempotence, vault_id ssh/https/no-remote matrix, read-state round-trip, snooze sweep-once/re-arm/drop, corrupt-db recovery, shim-import idempotence, native sqlite smoke).

### Completion Notes List

- `better-sqlite3@12.11.1` pinned exact (story-named dep); `@types/better-sqlite3@7.6.13` added as devDependency (types companion, dev-only).
- `src/core/db/index.ts` is the sole `new Database()` site: WAL, `PRAGMA user_version` + ordered idempotent migrations in one transaction, corrupt/missing db renamed aside (`app.db.corrupt-<ts>`) and recreated fresh — log, don't crash (AC5). Six M2 tables verbatim from architecture-m2.md §3.
- `vault_id` = normalized origin remote URL (ssh `git@h:o/r.git` ≡ https `https://h/o/r.git` → `h/o/r`, host lowercased, `.git` stripped) else absolute vault path; computed once per core-host lifetime (host restarts on vault switch) and cached in handlers.
- Settings (identity/theme/mcpToken/mcpPort) moved from the userData settings.json shim to app.db `meta` (keys `settings:*`, app-global — `app_settings` stays per-vault for later stories). `initSettings` now performs the one-time JSON import + rename to `.bak`; idempotent by construction (file gone after import). In-memory fallback keeps bare unit-test hosts (no userData dir) working.
- `readState.get/mark` channels added to the contract; handlers degrade to all-unread / no-op without a db. Renderer: `useHandoffs.readAt` (id-keyed), gold `.unread-dot` on the routing-slip card, `openBrief` marks read. read_state rows key on vault-relative note paths.
- `snooze_timers` mirror: reconcile-from-frontmatter runs on every `handoffs.list` (board load); a changed `until` re-arms `notified`, a no-longer-snoozed card drops its row; `sweepExpiredSnoozes` flips `notified` and returns each due id exactly once per machine (`until < today`, same derivation as the lib's expired flag). Sweep wiring to the poller tick + `snooze.expired` emission lands with stories 9.1/9.3 (this story ships the store + event type, per Dev Notes).
- CI native-smoke job (shared with the 9.3 watcher smoke) rebuilds native deps via `electron-builder install-app-deps` and reruns `tests/native-smoke` under `ELECTRON_RUN_AS_NODE` so the packaged Electron ABI is what's exercised (AC6); committed with story 9.3 which owns the ci.yml job.
- Deviation: dev-mode `electron-vite dev` needs `electron-builder install-app-deps` once after install so better-sqlite3 matches Electron's ABI (vitest/tsc use the node ABI build; packaging rebuilds automatically).

### File List

- package.json / package-lock.json (better-sqlite3 12.11.1 exact, @types/better-sqlite3 dev)
- src/core/db/index.ts (new — sole opener, migrations, vault_id, meta/app_settings helpers)
- src/core/db/read-state.ts (new)
- src/core/db/snooze.ts (new)
- src/core/db/db.test.ts (new)
- src/core/settings.ts (JSON shim → app.db meta + one-time import)
- src/core/settings.test.ts (rewritten for the db backend + shim migration)
- src/core/consume.test.ts (settings persistence assertion → app.db)
- src/core/index.ts (initAppDb before initSettings)
- src/core/handlers.ts (readState channels, vault_id cache, board-load snooze reconcile)
- src/shared/ipc-contract.ts (readState.get/mark channels, snooze.expired CoreEvent)
- src/renderer/src/stores/handoffs.ts (readAt map, markRead)
- src/renderer/src/components/HandoffCardView.tsx (unread prop + dot)
- src/renderer/src/views/handoffs/Board.tsx (dot wiring, mark-on-open)
- src/renderer/src/styles.css (.unread-dot)
- tests/native-smoke/sqlite.test.ts (new)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10 (v2.0 / story 9.2 scope)

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC1/2: WAL app.db opened by the core host only; `PRAGMA user_version` migrations idempotent (`db.test.ts` runs them twice); M2 schema tables all present, keyed on vault_id (normalized remote).
- AC3: v0.1 JSON shim imported once then renamed `.bak`; renderer reads/writes read-state via the IPC pair only (grep-verified: no renderer sqlite).
- AC4/5: snooze mirror reconciles from frontmatter on board load + post-integrate; expiry sweep emits once per machine (`notified` flag); corrupt/missing db recreates fresh.
- AC6: `tests/native-smoke/sqlite.test.ts` runs against the packaged Electron ABI in CI (`.github/workflows/ci.yml`).
- E2E drive exercised the db live (poll cursor, project roots, contract scan cache).
