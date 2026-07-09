# Story 5.1: loredex PR-4 — syncStatus (loredex repo)

## Status

Approved

## Story

**As an** app and CLI,
**I want** a read-only `syncStatus()` export,
**so that** sync health has one authoritative source.

## Acceptance Criteria

1. loredex exports `syncStatus()`: ahead/behind counts, branch/remote match, merge-driver status, and collected warnings — read-only git queries only.
2. The exported `SyncHealth` type is the IPC contract's payload type.
3. Tests in the loredex repo; release published; desktop pin bumped.

## Tasks / Subtasks

- [ ] Implement syncStatus (AC: 1)
  - [ ] In the loredex repo: `syncStatus()` in `core/` — remote reachability (ls-remote with timeout), branch vs configured canonical branch match, ahead/behind (`git rev-list --left-right --count`), merge-driver installed + gitattributes pattern valid (reuse `ensureGeneratedMergeDriver` checks read-only), last push/pull timestamps (reflog), accumulated stderr warnings
  - [ ] Strictly read-only: no fetch, no writes — callers decide when to fetch (the app's poller already does)
- [ ] Type export (AC: 2)
  - [ ] Export `SyncHealth` with the fields above from `lib.ts`
- [ ] Release (AC: 3)
  - [ ] Tests; release; desktop pin bump; replace the `SyncHealth` stub in `src/shared/types.ts`

## Dev Notes

- **Repo:** sibling `loredex` repo. `gitPullPush` today is act-only — this PR adds the observe side. [Source: architecture.md#loredex-library-surface]
- `SyncHealth` is the payload of `sync.status` AND the `sync.changed` push event — the poller (desktop Story 3.5) will construct/refresh it, the panel (Story 5.2) renders it; shape it once here. [Source: architecture.md#ipc-contract]
- Merge-driver status matters most: the F8 gitattributes bug warned on every op and nobody saw it — `syncStatus` must treat a broken/missing merge-driver rule as a first-class warning, not a footnote. [Source: architecture.md#git-strategy]
- Ahead/behind semantics: against the fetched remote ref (no implicit fetch) — document this in the export's JSDoc so callers know freshness = last fetch.

### Testing

- loredex repo: fixture repos covering — clean/ahead/behind/diverged, wrong branch, missing remote, broken gitattributes pattern, stale reflog. All queries verified side-effect-free (git status hash unchanged). [Source: architecture.md#testing-strategy]

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
