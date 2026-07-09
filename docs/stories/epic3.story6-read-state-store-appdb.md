# Story 3.6: Per-user read-state store (app.db)

## Status

Approved

## Story

**As a** user,
**I want** unread tracking that never touches the vault,
**so that** per-user state stays out of team truth (FR18, NFR7).

## Acceptance Criteria

1. `app.db` (better-sqlite3) lives in the app's userData dir and is opened by the core host only; schema covers read-state, notification log, snoozes, and UI prefs.
2. The renderer reads/writes read-state exclusively via IPC calls.
3. Unread status is computed per handoff; deleting `app.db` loses read-state only — the vault is untouched.
4. The CI native-module smoke test covers better-sqlite3 against the packaged Electron ABI.

## Tasks / Subtasks

- [ ] DB layer (AC: 1)
  - [ ] `npm i -E better-sqlite3` (12.x)
  - [ ] `src/core/db/index.ts`: open `<userData>/app.db` (path passed from main at fork), WAL mode, versioned migrations table; the ONLY `new Database()` call site in the codebase
  - [ ] `src/core/db/read-state.ts`: tables `read_state(item_id, read_at)`, `notification_log(id, kind, item_id, created_at, delivered)`, `snoozes(item_id, until)`, `prefs(key, value)`
- [ ] IPC surface (AC: 2, 3)
  - [ ] Add contract channels `readState.get { in: { ids: string[] }; out: Record<string, boolean> }`, `readState.markRead { in: { id: string }; out: void }`, `prefs.get`/`prefs.set` (app-local types in `shared/types.ts`)
  - [ ] Board (Story 3.2) renders unread dots from `readState.get`; opening a handoff marks it read
  - [ ] Migrate the identity profile + settings JSON (Stories 1.4/3.4) into `prefs` — one prefs home from here on (vault path may stay in main's bootstrap JSON since main needs it pre-fork)
- [ ] Disposability (AC: 3)
  - [ ] Startup handles a missing/corrupt `app.db` by recreating it fresh (log, don't crash); nothing vault-related is stored
- [ ] Native smoke (AC: 4)
  - [ ] Extend `tests/native-smoke/` with `better-sqlite3` open/write/read against the packaged Electron ABI (same CI job as the watcher smoke)

## Dev Notes

- State-placement rule is the whole story: per-user churny state (read/unread, notification log, snoozes, prefs) in app-local SQLite, NEVER in the vault (12-writer merge pressure, F8 lesson). Deleting `app.db` must lose read-state only. [Source: architecture.md#state-placement]
- Core host is the sole SQLite opener; renderer access is IPC-only (sandbox + one-writer discipline). [Source: architecture.md#process-model] [Source: architecture.md#coding-standards]
- `item_id` for handoffs = the stable handoff id from `HandoffCard` (lib PR-1) — same id space the poller dedupe (Story 3.5) and notification log use.
- better-sqlite3 is synchronous — fine in the core host, but keep statements prepared and short; it must never run in main or renderer. ABI churn is risk 5 → the smoke test. [Source: architecture.md#tech-stack] [Source: architecture.md#testing-strategy]
- The poller's last-notified SHA (Story 3.5 in-memory TODO) moves into `prefs` here.
- Files: `src/core/db/index.ts`, `src/core/db/read-state.ts`, `src/shared/ipc-contract.ts` (+channels), `src/core/ipc.ts` (register), `src/renderer/src/stores/handoffs.ts` (unread), `tests/native-smoke/sqlite.test.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: migrations idempotent, read-state round-trip, snooze expiry, corrupt-db recovery. Native smoke in CI. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 3 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
