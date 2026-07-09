# Story 3.5: Remote-event poller & write lock

## Status

Approved

## Story

**As a** sender,
**I want** the app to notice remote vault commits safely,
**so that** notifications arrive without racing concurrent writers (FR17, risk 12).

## Acceptance Criteria

1. The core host runs `git fetch` (never pull) every 60 s while a window is focused and every 5 min in background/tray.
2. Notification events are parsed from `git log ..origin/<branch>` on the fetched ref **without merging**, emitting typed CoreEvents (`handoff.new`, `handoff.stateChanged`).
3. A core-host write lock is taken by every lib write operation; the poller pulls only when the lock is free and the working tree clean, deferring otherwise while sync health shows "behind N, integrating…".
4. After every integrate, state is reconciled from filesystem + git truth and indexes regenerated (`rebuildIndexes`).
5. Unit tests cover lock gating and remote-log event parsing.

## Tasks / Subtasks

- [ ] Write lock (AC: 3)
  - [ ] `src/core/write-lock.ts`: async mutex `withWriteLock<T>(fn): Promise<T>` + `isLocked()`; replace Story 3.4's shim; wrap ALL engine-facade write ops (consume, store, route, sync, dashboard.build)
- [ ] Poller loop (AC: 1)
  - [ ] `src/core/poller.ts`: interval driven by focus state (main forwards window focus/blur to the core host); focused 60 s, background 5 min; each tick: async `git fetch` (PR-5 async variants) — never pull in the tick path
- [ ] Remote event parsing (AC: 2)
  - [ ] After fetch: `git log <local>..origin/<branch> --name-status` (read-only, no merge); map changed handoff notes to events — new handoff note → `handoff.new` (build `HandoffCard` by reading the note content from the fetched ref via `git show origin/<branch>:<path>` + `parseDoc`); consume/status field change → `handoff.stateChanged` with by-identity from the commit/frontmatter
  - [ ] Dedupe: remember the last-notified remote SHA (in-memory + app.db once 3.6 lands) so events fire once
- [ ] Gated integrate (AC: 3, 4)
  - [ ] When behind: if lock free AND `git status --porcelain` clean → `git pull` (async), then `watcher.reconcile()` (Story 2.3) + `rebuildIndexes()`; else defer to next tick and emit `sync.changed` with "behind N, integrating…" state
- [ ] Tests (AC: 5)

## Dev Notes

- This is the app's most safety-critical component; the design is fully decided — implement, don't redesign. Fetch is always safe (never touches the working tree); notifications parse from the remote ref WITHOUT merging so the sender-notification path never waits on a race; pull is gated on lock + clean tree; reconcile after every integrate. [Source: architecture.md#remote-event-poller--write-lock]
- The write lock serializes the app's own writes against its own pull — CLI/agent writes racing the pull are git's problem (per-operation shell-outs), not the lock's. Do not try to lock out external writers. [Source: architecture.md#remote-event-poller--write-lock]
- Use the PR-5 async git variants exclusively here — a sync fetch would serialize MCP responses (risk 6). [Source: architecture.md#loredex-library-surface]
- `handoff.new` / `handoff.stateChanged` / `sync.changed` event shapes are in the contract. Emitting them is this story; consuming them (notifications, badge) is Story 3.7. [Source: architecture.md#ipc-contract]
- Focus signal: main owns windows → main sends focus/blur over the core-host control channel at broker time (tiny, logic-free forwarding). [Source: architecture.md#process-model]
- The ≤2 min consume-notification metric is one 60 s cadence + processing — don't add batching delays on the parse path.
- Files: `src/core/write-lock.ts`, `src/core/poller.ts`, `src/core/engine.ts` (wrap writes), `src/core/git.ts` (async query helpers), `src/main/index.ts` (focus forwarding). [Source: architecture.md#source-tree]

### Testing

- Unit: lock mutual exclusion + queue fairness; parse fixtures (git log/name-status output → events; consume diff → stateChanged); gating truth table (lock × dirty-tree × behind). Integration: two-clone fixture repo — commit a handoff in clone A, fetch in B, assert `handoff.new` without merge, then integrate and assert reconcile ran. The loredex repo's merge-driver fixture tests cover the concurrent-writer pull scenarios. [Source: architecture.md#testing-strategy]

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
