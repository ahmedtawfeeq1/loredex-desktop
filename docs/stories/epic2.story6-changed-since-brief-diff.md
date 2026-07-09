# Story 2.6: Changed-since-last-brief diff

## Status

Approved

## Story

**As a** PM,
**I want** to see what changed since the last brief,
**so that** the daily question is the delta, not a restatement.

## Acceptance Criteria

1. A watcher snapshot (`writeSnapshot`) is recorded after each successful curate; `getEventsSince` computes the delta on demand.
2. The home shows "changed since last brief" as added/modified/deleted note lists, each linked into the reader.
3. An empty state appears when nothing changed; snapshots survive app restarts.

## Tasks / Subtasks

- [ ] Snapshot lifecycle (AC: 1, 3)
  - [ ] Extend `src/core/watcher.ts`: after a successful `dashboard.build` (hook from Story 2.5), call `@parcel/watcher` `writeSnapshot(vaultPath, snapshotFile)`; snapshot file lives in `userData` (per-machine derived state, NOT the vault)
  - [ ] On demand, `getEventsSince(vaultPath, snapshotFile)` → classify into added/modified/deleted markdown paths (filter `.git/**`, non-md)
- [ ] Contract + UI (AC: 2, 3)
  - [ ] Add contract channel `dashboard.changedSince` `{ in: void; out: { added: string[]; modified: string[]; deleted: string[] } | { noSnapshot: true } }` in `src/shared/ipc-contract.ts`
  - [ ] Home section `views/home/ChangedSince.tsx`: three linked lists into the reader; empty state ("no changes since the last brief"); no-snapshot state prompts a first curate

## Dev Notes

- `writeSnapshot`/`getEventsSince` is @parcel/watcher's own API — the "what changed since last brief" primitive named in the plan. All watcher API usage stays inside `src/core/watcher.ts`. [Source: architecture.md#source-tree]
- Snapshot placement: this is derived, per-machine state → `userData`, never the vault (state-placement hard rule; it's also not team-relevant). Persisting in `userData` gives restart survival for free. [Source: architecture.md#state-placement]
- The delta is a recomputed cache — if the snapshot is missing or stale-corrupt, degrade to the no-snapshot state rather than guessing. [Source: architecture.md#state-placement]
- Deleted notes can't open in the reader — render them unlinked with a tombstone style.
- Small story by design; it completes FR3 and Epic 2.
- Files: `src/core/watcher.ts`, `src/shared/ipc-contract.ts` (+channel), `src/core/ipc.ts` (register), `src/renderer/src/views/home/ChangedSince.tsx`. [Source: architecture.md#source-tree]

### Testing

- Unit: classification (add/modify/delete against a temp dir), md filtering, no-snapshot path. Integration: curate → touch files → delta matches. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 2 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
