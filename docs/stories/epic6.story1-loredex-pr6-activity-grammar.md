# Story 6.1: loredex PR-6 — activity event grammar (loredex repo)

## Status

Done

## Story

**As an** app and CLI,
**I want** one shared activity-event grammar parsed from git history,
**so that** both surfaces describe vault activity identically (FR15).

## Acceptance Criteria

1. loredex exports `parseActivity(gitLog)` producing typed, identity-attributed events (route/consume/handoff/sync) from vault git history — read-only.
2. The exported `ActivityEvent` type is the IPC contract's payload type.
3. Tests in the loredex repo; release published; desktop pin bumped.

## Tasks / Subtasks

- [x] Grammar + parser (AC: 1)
  - [x] In the loredex repo: define `ActivityEvent` — `{ kind: 'route'|'consume'|'handoff'|'sync'; actor: {name, email}; at: ISO; subject: {path?, handoffId?, project?}; summary: string; sha: string }`
  - [x] `parseActivity(gitLog)`: parse structured git log output (commit message conventions the engine already writes via `gitAutoCommit`, plus name-status paths) into events; unknown commits → a generic `sync`-kind event, never dropped silently
  - [x] Document the commit-message grammar it relies on so future engine writes stay parseable (one grammar, lib-owned)
- [x] Export + release (AC: 2, 3)
  - [x] Export `parseActivity` + `ActivityEvent` from `lib.ts`; tests; release; desktop pin bump; replace the `ActivityEvent` stub in `src/shared/types.ts`

## Dev Notes

- **Repo:** sibling `loredex` repo. Read-only, but it lives in the lib deliberately: CLI and app must share ONE event grammar (the work-plan's rationale). [Source: architecture.md#loredex-library-surface]
- The vault git log already IS the feed (spec evidence) — this PR just types it. Identity attribution comes from commit author (which the app writes via `-c` injection and the CLI via ambient config — the M1 identity caveat applies and is fine).
- `ActivityEvent` is the `activity.feed` channel payload — include everything Story 6.2's UI renders (day grouping key, avatar source, navigation subject) so the app does zero re-parsing. [Source: architecture.md#ipc-contract]
- Parser input should be a well-defined git log format string (e.g. `--pretty` with a record separator + `--name-status`), exported as a constant so callers invoke git identically.

### Testing

- loredex repo: fixture log covering each event kind, unknown-commit fallback, malformed-line resilience, author attribution, ordering stability. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 6 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Claude Code)

### Debug Log References

- loredex repo: `npm run typecheck` clean; `npm run lint` clean; `npm test` 115/115 green; `npm run build` OK (commit 95c04cc)
- Manual: `parseActivity` over the nimbus vault's real git log — 30 commits typed as handoff/route/consume/sync with correct actors/subjects

### Completion Notes List

- `parseActivity(gitLog)` + `ActivityEvent` in new `loredex/src/core/activity.ts`: `{kind: route|consume|handoff|sync, actor {name,email}, at ISO, subject {path?, handoffId?, project?}, summary, sha}`; identity from commit author; unknown commits become generic `sync` events (never dropped); malformed records skipped without throwing; input (newest-first) order preserved.
- `ACTIVITY_LOG_ARGS` exported so every caller invokes `git log` identically (record/unit separators + `--name-status`); the engine commit-message grammar is documented in the module JSDoc (route/consume/handoff patterns from `gitAutoCommit` call sites).
- Desktop `ActivityEvent` stub replaced with the lib type.
- Tests: each event kind, unknown-commit fallback, malformed-line resilience, ordering stability, and a real-git end-to-end parse using `ACTIVITY_LOG_ARGS`.
- DEVIATION: no npm release/pin bump — local `file:` dep; release-time TODO.

### File List

- loredex: src/core/activity.ts (new), src/lib.ts, tests/activity.test.ts (commit 95c04cc)
- loredex-desktop: src/shared/types.ts

## QA Results

**Verdict: PASS** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1: verified — `parseActivity` + `ACTIVITY_LOG_ARGS` in the lib; tests cover every kind, unknown-commit fallback, malformed resilience, ordering, and a real-git end-to-end parse. M1 driver parsed 29 real events ({route: 9, handoff: 8, consume: 6, sync: 6}) from the nimbus vault with identity attribution.
- AC2: verified — desktop `ActivityEvent` is the lib type.
- AC3: lib tests green; no npm release/pin bump (file: dep — shared release blocker, tracked once in sprint-status).
