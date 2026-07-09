# Story 6.2: Activity feed view

## Status

Approved

## Story

**As a** PM,
**I want** a chronological, attributed activity feed,
**so that** "who routed/synced/consumed what" needs no `git log` (FR15).

## Acceptance Criteria

1. A feed view calls `activity.feed {since}` and renders events chronologically with day headers and identity avatars (initials).
2. Clicking an event navigates to the related note or handoff.
3. The feed loads incrementally and updates after poller integrates.

## Tasks / Subtasks

- [ ] Core handler (AC: 1, 3)
  - [ ] Register `activity.feed` → run git log in the vault with PR-6's exported format constant (async helper), pipe through `parseActivity`; `since` maps to `--since`/last-SHA paging
  - [ ] Cache the parsed feed (recomputed cache — invalidate on `vault.changed` + post-integrate)
- [ ] Feed UI (AC: 1, 2, 3)
  - [ ] `views/feed/FeedView.tsx`: day headers (GitHub-Desktop-History pattern), event rows — initials avatar (from actor name, deterministic color), kind icon, summary, relative time
  - [ ] Click → subject navigation: note path → reader; handoffId → board card; sync events → sync panel
  - [ ] Infinite scroll paging via `since`; live prepend on `sync.changed` post-integrate

## Dev Notes

- Depends on Story 6.1's pin bump — the app calls `parseActivity` and renders; zero app-side git-log parsing. [Source: architecture.md#loredex-library-surface]
- The feed is a recomputed cache, never authoritative — invalidate and rebuild from git truth on integrate; do not persist it in app.db. [Source: architecture.md#state-placement]
- Avatars: initials only in M1 (identity = name/email; no gravatar network calls — privacy-sensitive audience).
- Navigation targets reuse existing stores/routes (reader Story 2.1, board Story 3.2, sync Story 5.2) — wire through the renderer router, no new data channels beyond `activity.feed`. [Source: architecture.md#ipc-contract]
- Files: `src/core/ipc.ts` (register), `src/core/git.ts` (log helper), `src/renderer/src/views/feed/FeedView.tsx`, `src/renderer/src/stores/feed.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: day grouping across timezones/midnight, paging cursor logic, navigation-target mapping, avatar determinism. Integration: fixture vault history renders the expected event sequence. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 6 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
