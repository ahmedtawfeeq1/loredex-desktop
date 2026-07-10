# Story 3.5: Remote-event poller & single-flight write lock (M2-upgraded — board id 9.1)

## Status

Done

## Story

**As a** sender,
**I want** the app to notice remote vault commits safely,
**so that** notifications arrive without racing concurrent writers (FR17, risk 12).

## Acceptance Criteria

1. The core host runs `git fetch origin <branch>` (never pull, fetch runs outside the lock) every 60 s while any app window is focused and every 5 min while blurred; main forwards focus/blur over the control channel; manual "Sync now" resets the clock.
2. Notification events are parsed **without merging**: `git log --name-status <last_seen_sha>..origin/<branch>` scoped to `projects/*/handoffs/*.md`; each touched file is read from the remote ref via `git show origin/<branch>:<path>` + `parseDoc`, diffed against the local copy → `handoff.new` (added) or `handoff.stateChanged` (status differs, payload carries `reason?`/`until?`).
3. The poll cursor persists in app-db `poll_cursor (vault_id, branch, last_seen_sha, last_fetch_at)`; `last_seen_sha` advances only after events are emitted; a fresh cursor seeds `last_seen_sha = origin/<branch>` and emits nothing (no notification storm on join).
4. A single async mutex (`src/core/write-lock.ts`) is the ONLY gate: every lib write (`createHandoff`, `setHandoffStatus`, `consumeHandoff`, `routeFile`, wizard git ops) and the poller's pull acquire it. The poller uses `tryAcquire` (skip tick if busy — user work always wins); user-initiated `sync.run` uses blocking `acquire`. Never two concurrent git mutations, by construction.
5. Integrate (pull) is gated on lock free AND clean worktree; dirty/busy → defer to next tick with sync health "behind N, integrating…". After every pull: `rebuildIndexes` + full reconcile (F4 rule), including `snooze_timers` ← frontmatter.
6. Unit tests cover lock gating (tryAcquire vs acquire), cursor semantics, and remote-log event parsing.

## Tasks / Subtasks

- [x] Write lock (AC: 4)
  - [x] `src/core/write-lock.ts`: async mutex with `acquire()`/`tryAcquire()`/`isLocked()`; replace Story 3.4's shim; wrap ALL engine-facade write ops including the M2 additions (create/reply/setStatus/annotate/routeFile/wizard git ops)
- [x] Poller loop (AC: 1)
  - [x] `src/core/poller.ts`: interval driven by focus state (60 s / 5 min); each tick: async `git fetch` (PR-5 async variants) outside the lock — never pull in the tick path; "Sync now" resets the timer
- [x] Remote event parsing + cursor (AC: 2, 3)
  - [x] Scoped `git log --name-status --format=…` from the cursor; `git show` + `parseDoc` per touched handoff; emit `handoff.new`/`handoff.stateChanged`; advance `poll_cursor.last_seen_sha` after emit
  - [x] Fresh-cursor seeding (join flow): set to `origin/<branch>`, emit nothing
- [x] Gated integrate (AC: 5)
  - [x] `tryAcquire` + `git status --porcelain` clean → async `git pull`, then `watcher.reconcile()` (Story 2.3) + `rebuildIndexes()` + snooze_timers reconcile; else defer + `sync.changed` "behind N, integrating…"
- [x] Tests (AC: 6)

## Tasks / Subtasks (M2 delta, if the M1 cut already landed)

- [x] Swap in-memory last-notified SHA for `poll_cursor` rows (app-db, Story 3.6/9.2)
- [x] Add `tryAcquire` and rewire the poller's pull to skip-if-busy; blocking `acquire` reserved for user-initiated writes/sync
- [x] Scope the log to `projects/*/handoffs/*.md`; add fresh-cursor seeding; extend `handoff.stateChanged` payload with `reason?`/`until?`

## Dev Notes

- This is the app's most safety-critical component; the M2 spec finalizes the M1 design — implement, don't redesign. Fetch is always safe; parse from the remote ref without merging; pull gated on lock + clean tree; reconcile after every integrate. [Source: architecture-m2.md#4-remote-poller] [Source: architecture.md#remote-event-poller--write-lock]
- **Single-flight coordination is the M2 upgrade:** one mutex instance in the core host; poller `tryAcquire` (user work wins), `sync.run` blocking `acquire`. The lock serializes the app's own writes against its own pull — CLI/agent writes racing the pull are git's problem, not the lock's. [Source: architecture-m2.md#4-remote-poller]
- `poll_cursor` lives in app-db (Story 3.6/9.2 owns the table; this story owns its read/write semantics). Advance-after-emit is the exactly-once discipline; seed-on-fresh kills the join notification storm. [Source: architecture-m2.md#3-app-db] [Source: architecture-m2.md#4-remote-poller]
- Use the PR-5 async git variants exclusively (risk 6). Snooze_timers reconcile-from-frontmatter after every pull is part of the F4 full reconcile. [Source: architecture-m2.md#4-remote-poller]
- The ≤2 min consume-notification metric is one 60 s cadence + processing — no batching delays on the parse path.
- Files: `src/core/write-lock.ts`, `src/core/poller.ts`, `src/core/engine.ts` (wrap writes), `src/core/git.ts` (async query helpers), `src/core/db/index.ts` (poll_cursor), `src/main/index.ts` (focus forwarding). [Source: architecture.md#source-tree]

### Testing

- Unit: lock mutual exclusion + queue fairness + tryAcquire skip; parse fixtures (name-status → events; status diff → stateChanged with reason/until); gating truth table (lock × dirty-tree × behind); cursor advance-after-emit + fresh-seed. Integration: two-clone fixture — commit a handoff in clone A, fetch in B, assert `handoff.new` without merge, integrate, assert reconcile + cursor. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 3 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |
| 2026-07-10 | 2.0 | M2 upgrade (board id 9.1): single-flight tryAcquire/acquire, app-db poll_cursor, scoped log, fresh-cursor seeding, stateChanged payload extension — per architecture-m2.md §4 | Bob (SM) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `npm run typecheck` clean; `npm test` 38 files / 239 tests green; `npm run build` green.
- Two-clone integration test (definition of done): bare fixture remote + clone A/B; push a handoff from A → `handoff.new` emitted in B within ONE `tick()` (before any merge), gated integrate pulls + reconciles, cursor lands on `origin/main`.

### Completion Notes List

- `write-lock.ts` is now a real FIFO async mutex (`createWriteLock` + THE `writeLock` instance): `acquire()` blocking for user work, `tryAcquire()` for the poller (skip tick when busy — user work always wins), `isLocked()`. `withWriteLock` kept with the story-3.4 signature, now built on the instance — every existing write call site (consume/create/reply/setStatus/annotate/route.file/sync.run) rides the same mutex as the poller's pull, so two concurrent git mutations are impossible by construction. Double-release is a no-op (tested).
- `poller.ts`: focus-driven cadence (60 s / 5 min, `setFocused` swaps the live timer), immediate first tick on start, no overlapping ticks. Tick = async `git fetch` (outside the lock, worktree-safe) → `git log --name-status --format=%H <last_seen>..origin/<branch> -- projects` filtered to `projects/*/handoffs/*.md` → `git show origin/<branch>:<path>` + lib `parseDoc` per touched file → `handoff.new` (remote-only file, full board card constructed from remote frontmatter) / `handoff.stateChanged` (status drift; payload carries `by` parsed from the transition's `*_by` attribution plus `reason?`/`until?`) → cursor advances ONLY after emit (asserted by call-order test). Fresh cursor seeds to `origin/<branch>` and emits nothing (no join storm). Deletions/renames handled; unparseable remote notes skipped, never crash the loop.
- Gated integrate: `rev-list --count HEAD..origin/<branch>` > 0 → `tryAcquire` + `git status --porcelain` clean → lib `gitPullPush` under the profile identity, then `rebuildIndexes` + link/facet cache invalidation + `notifier.refresh()` (badge + notifications) + `snooze_timers ← frontmatter` (story 9.2 mirror) — the F4 full reconcile; then `vault.changed []` (full refetch) + `sync.changed`. Busy/dirty → defer, `sync.changed` alone (panel shows "behind N"). Truth table unit-tested (behind × lock × dirty).
- Poll cursor persists in app-db `poll_cursor` (get/setPollCursor added to `src/core/db/index.ts`; table shipped by 9.2).
- Focus forwarding: main listens `browser-window-focus/blur` → `{t:'focus',focused}` over the fork channel (typed `CoreControlMessage`); core routes to `poller.setFocused`. "Sync now" resets the clock via a `hooks.onSyncRun` callback filled after wiring (handlers can't see the poller at register time — it needs the notifier they return).
- F8 without spam: a failing poll emits `git.warning` once per distinct failure, re-armed by the next healthy tick (tested).
- Deviations: (1) lib PR-5 "async git variants" are not in the pinned loredex 2.1.0 — fetch/log/show/status/rev-* run through a new app-side async runner (`gitAsync`, read-only queries + fetch, allowed app-side); the pull itself stays the lib's synchronous `gitPullPush` (anti-second-engine — the only pull writer), which briefly blocks the core host (architecture: blocking is fine here). (2) `watcher.reconcile()` call lands with story 9.3 (watcher doesn't exist yet this story); the poller's own reconcile covers indexes/caches/badge/snooze, and 9.3 re-walks on its `vault.changed`.
- Poller starts only for vaults with an origin remote (identity() reads .git/config) AND an app-db (main forked with --user-data); local-only vaults keep manual sync.

### File List

- src/core/write-lock.ts (real FIFO mutex replacing the 3.4 shim) + src/core/write-lock.test.ts (new)
- src/core/poller.ts (new) + src/core/poller.test.ts (new — parse fixtures, cursor discipline, gating truth table, two-clone integration)
- src/core/git.ts (async `gitAsync` runner)
- src/core/engine.ts (`parseMarkdown`, `rebuildVaultIndexes` facade exports)
- src/core/db/index.ts (PollCursor + get/setPollCursor)
- src/core/index.ts (poller wiring: cursor via app-db, pullAndReconcile, focus routing)
- src/core/handlers.ts (hooks.onSyncRun — "Sync now" resets the poll clock)
- src/shared/ipc-contract.ts (CoreControlMessage: port + focus)
- src/main/index.ts (browser-window-focus/blur forwarding — display-state only)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10 (v2.0 / story 9.1 scope)

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC1: focus/blur cadence (60s/5min) + control-channel forwarding + Sync-now clock reset covered in `poller.test.ts`.
- AC2/3: fetch-only parse (`git show origin/<branch>:<path>`), cursor advances only after emit, fresh cursor seeds silently — all unit-covered AND proven live in the E2E drive: quiet seed tick, then a genuine second-clone push produced `handoff.new` for exactly the pushed card, the gated integrate pulled it to disk, and the cursor advanced.
- AC4/5: single-flight `write-lock.ts` gates every lib write (tryAcquire for the poller, blocking acquire for sync.run) — `write-lock.test.ts`; post-pull F4 reconcile incl. snooze mirror.
