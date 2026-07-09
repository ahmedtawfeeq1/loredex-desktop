# Story 6.1: loredex PR-6 — activity event grammar (loredex repo)

## Status

Approved

## Story

**As an** app and CLI,
**I want** one shared activity-event grammar parsed from git history,
**so that** both surfaces describe vault activity identically (FR15).

## Acceptance Criteria

1. loredex exports `parseActivity(gitLog)` producing typed, identity-attributed events (route/consume/handoff/sync) from vault git history — read-only.
2. The exported `ActivityEvent` type is the IPC contract's payload type.
3. Tests in the loredex repo; release published; desktop pin bumped.

## Tasks / Subtasks

- [ ] Grammar + parser (AC: 1)
  - [ ] In the loredex repo: define `ActivityEvent` — `{ kind: 'route'|'consume'|'handoff'|'sync'; actor: {name, email}; at: ISO; subject: {path?, handoffId?, project?}; summary: string; sha: string }`
  - [ ] `parseActivity(gitLog)`: parse structured git log output (commit message conventions the engine already writes via `gitAutoCommit`, plus name-status paths) into events; unknown commits → a generic `sync`-kind event, never dropped silently
  - [ ] Document the commit-message grammar it relies on so future engine writes stay parseable (one grammar, lib-owned)
- [ ] Export + release (AC: 2, 3)
  - [ ] Export `parseActivity` + `ActivityEvent` from `lib.ts`; tests; release; desktop pin bump; replace the `ActivityEvent` stub in `src/shared/types.ts`

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

### Debug Log References

### Completion Notes List

### File List

## QA Results
