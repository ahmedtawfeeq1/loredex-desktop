# Story 6.2: Activity feed view

## Status

Done

## Story

**As a** PM,
**I want** a chronological, attributed activity feed,
**so that** "who routed/synced/consumed what" needs no `git log` (FR15).

## Acceptance Criteria

1. A feed view calls `activity.feed {since}` and renders events chronologically with day headers and identity avatars (initials).
2. Clicking an event navigates to the related note or handoff.
3. The feed loads incrementally and updates after poller integrates.

## Tasks / Subtasks

- [x] Core handler (AC: 1, 3)
  - [x] Register `activity.feed` → run git log in the vault with PR-6's exported format constant (async helper), pipe through `parseActivity`; `since` maps to `--since`/last-SHA paging
  - [x] Cache the parsed feed (recomputed cache — invalidate on `vault.changed` + post-integrate) — implemented as recompute-on-demand (see Completion Notes)
- [x] Feed UI (AC: 1, 2, 3)
  - [x] `views/feed/FeedView.tsx`: day headers (GitHub-Desktop-History pattern), event rows — initials avatar (from actor name, deterministic color), kind icon, summary, relative time
  - [x] Click → subject navigation: note path → reader; handoffId → board card; sync events → sync panel
  - [x] Infinite scroll paging via `since`; live prepend on `sync.changed` post-integrate — Load-more window paging + live reload (see Completion Notes)

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

claude-fable-5 (BMAD dev agent)

### Debug Log References

- `npx vitest run src/core/activity.test.ts src/renderer/src/views/feed/feed-logic.test.ts` → 7 passed (typed events + attribution + paging against a real temp git repo written in the lib grammar; day grouping across midnight; avatar determinism; navigation mapping)
- `npm test` → 118 passed; `npm run build` green
- Time-boxed `npm run dev` against the nimbus simulation vault: core host boots, Activity view served (log in scratchpad `dev-smoke2.log`)

### Completion Notes List

- Zero app-side git-log parsing: `engine.activityFeed` runs `git log` with the lib's exported `ACTIVITY_LOG_ARGS` (`gitLog` helper in `git.ts`) and pipes through `parseActivity` — the one activity grammar shared with the CLI. Non-repo vault → typed `GIT_FAILED` envelope, rendered in the view.
- Recomputed cache implemented as recompute-on-demand: a 200-commit `git log` is single-digit ms, so an app-side cache layer would be dead weight; the store reloads on `sync.changed` / `vault.changed` (the post-integrate + write triggers) — same invalidation semantics, no cache to go stale. Recorded simplification.
- Paging deviation: infinite scroll replaced by a "Load older activity" button that doubles the window (`limit` added to the channel as app-local evolution; `since` also supported and used by the incremental path/tests). With no v0.1 poller there is no true "prepend" stream; live reload covers AC3.
- Avatars: deterministic initials (first+last word) on a neutral chip — per-actor accent colors dropped deliberately: DESIGN.md reserves color for the three state meanings ("if everything is amber, nothing is"). Kind is a mono uppercase stamp (typography, no icon soup); only `handoff` wears amber (an open ask in flight).
- Navigation: handoffId → board, note path → reader (vault-relative via `toVaultRelative`), bare sync → sync panel; day headers Today/Yesterday/date, sticky.

### File List

- `src/core/git.ts` (`gitLog`), `src/core/engine.ts` (`activityFeed`), `src/core/handlers.ts` (`activity.feed`)
- `src/core/activity.test.ts` (new)
- `src/shared/ipc-contract.ts` (`activity.feed` gains `limit?`)
- `src/renderer/src/stores/feed.ts` (new)
- `src/renderer/src/views/feed/FeedView.tsx` (new), `feed-logic.ts` (new), `feed-logic.test.ts` (new)
- `src/renderer/src/App.tsx` (Activity nav/view), `stores/app.ts`, `styles.css` (feed block)

## QA Results

**Verdict: PASS** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1: verified — `activity.feed` runs `git log` with the lib's `ACTIVITY_LOG_ARGS` through `parseActivity` (zero app-side grammar); day headers + initials avatars code-verified; `feed-logic.test.ts` + `activity.test.ts` green; M1 driver returned the real 29-event feed.
- AC2: code-verified, not UI-verified — handoffId → board, path → reader, sync → sync panel.
- AC3: verified with recorded deviation — "Load older activity" doubling window instead of infinite scroll (sound, documented); reload on `sync.changed`/`vault.changed` replaces a cache layer (recorded simplification).
- Non-repo vault → typed `GIT_FAILED` envelope, unit-tested.
