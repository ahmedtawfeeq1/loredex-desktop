# Story 5.2: Sync health panel

## Status

Approved

## Story

**As a** DevOps admin,
**I want** a panel that surfaces every git truth and warning,
**so that** failures like the gitattributes bug are caught on day one (F8, FR13).

## Acceptance Criteria

1. The panel shows remote reachable, branch match, ahead/behind, last push/pull, and merge-driver status via `sync.status`.
2. Every git stderr warning from any engine operation is surfaced as `git.warning` events and listed in the panel — nothing swallowed.
3. A sync-now button runs `sync.run`; the structured `SyncReport` renders per-operation results.
4. Engine/schema handshake mismatches (app vs CLI vs vault) warn loudly here (NFR8).
5. The MCP port-conflict error (Story 1.6) appears here with a settings override.

## Tasks / Subtasks

- [ ] Core handlers (AC: 1, 3)
  - [ ] Register `sync.status` → `syncStatus()` (PR-4); `sync.run` → async `gitPullPush` under the write lock, returning `SyncReport` (PR-5)
  - [ ] Poller (Story 3.5) refreshes `SyncHealth` after each fetch/integrate and pushes `sync.changed`
- [ ] Warning firehose (AC: 2)
  - [ ] Audit every engine-facade git call site: stderr/warnings from `SyncReport`s, drift queries, poller ops all emit `git.warning` events; panel keeps a scrolling warning log (persist recent N in app.db prefs)
- [ ] Panel UI (AC: 1, 3)
  - [ ] `views/sync/SyncPanel.tsx`: status grid (reachable / branch / ahead-behind / last push-pull / merge driver) in GitHub-Desktop-widget style; "behind N, integrating…" state from the poller; Sync Now button + `SyncReport` result list
- [ ] Handshake warnings (AC: 4)
  - [ ] Compare app engine/schema (discovery values) vs vault `.loredex/engine.json` vs last-seen CLI writes (schema stamps observed in frontmatter); material mismatch → prominent panel banner + `git.warning` event
- [ ] Port conflict (AC: 5)
  - [ ] Render the `PORT_CONFLICT` state with the settings override link (Story 1.6's setting)

## Dev Notes

- F8's lesson is the design rule: NOTHING that git says on stderr may be swallowed — the gitattributes warning printed on every op for a full day, unseen. The audit task is real work: grep every `execFile` path in the engine facade/git helpers and prove each has a warning path. [Source: architecture.md#git-strategy] [Source: architecture.md#coding-standards]
- `sync.status`/`sync.run`/`sync.changed`/`git.warning` are all existing contract members — this story implements their full loop. [Source: architecture.md#ipc-contract]
- Handshake sources: discovery file values written by `src/core/discovery.ts` (engineVersion/schemaVersion), vault `.loredex/engine.json` (PR-2), and observed `loredex_schema:` stamps. The version-skew split-brain (pinned app vs floating CLI) must produce a banner, not a log line. [Source: architecture.md#state-placement] [Source: architecture.md#mcp-hosting--discovery]
- `sync.run` is a write op → write lock; the panel disables Sync Now while locked (`LOCK_BUSY` envelope → spinner state). [Source: architecture.md#remote-event-poller--write-lock]
- Files: `src/core/ipc.ts` (register), `src/core/poller.ts` (health refresh), `src/renderer/src/views/sync/SyncPanel.tsx`, `src/renderer/src/stores/sync.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: handshake mismatch matrix (app/vault/CLI combos), warning-log ring buffer, LOCK_BUSY rendering. Integration: break the fixture vault's gitattributes → panel shows merge-driver FAIL + warning (the executable F8 regression). [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 5 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
