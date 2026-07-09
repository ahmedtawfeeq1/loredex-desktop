# Story 5.4: loredex PR-7b — CLI registry migration (loredex repo)

## Status

Approved

## Story

**As a** CLI user,
**I want** registration to flow through the vault registry with automatic migration,
**so that** status and doctor stop disagreeing (F7).

## Acceptance Criteria

1. CLI commands register and resolve via the vault registry; existing `config.json` state migrates on first run, idempotently.
2. `loredex doctor` validates registry consistency; status/doctor agree on registered repos.
3. The loredex regression suite passes; release published; desktop pin bumped.

## Tasks / Subtasks

- [ ] CLI rewire (AC: 1)
  - [ ] In the loredex repo: registration/list/status commands read+write the vault registry (PR-7a exports); `config.json` remains only for machine-local settings (vault location itself)
  - [ ] First run against a registry-capable vault migrates existing `config.json` project entries into the registry (attributed to the ambient identity), idempotent (re-running changes nothing), with a printed summary
- [ ] Doctor consistency (AC: 2)
  - [ ] `loredex doctor`: registry present/parseable, entries point at existing repos, this machine's registrations present, orphaned config.json entries flagged; `status` and `doctor` read the same resolution path (delete any duplicated logic)
- [ ] Release (AC: 3)
  - [ ] Full regression suite; release published (coordinated notes with 7a); desktop pin bumped; desktop's engine facade drops any registry-fallback special-casing

## Dev Notes

- **Repo:** sibling `loredex` repo. Completes feature 12 — "a loredex-core release consumed by the app, not an app feature".
- The F7 kill-shot: after this lands, `git clone <vault>` + `loredex status` shows the team's projects with zero per-machine setup — that's the wizard's foundation (Stories 5.5/5.6 assume it).
- Migration is the risky half: it must be idempotent, attributed, and loud (print what moved). A failed migration must leave config.json untouched (copy-then-verify, not move).
- Schema note: registry entries are engine writes → `loredex_schema` stamped; doctor's handshake checks (PR-10) extend to registry schema.
- Desktop follow-through in this story's pin bump: verify `config.get` now reflects registry truth on a fixture vault WITH registry (extend `tests/pinned-release.test.ts`).

### Testing

- loredex repo: migration idempotence, partial-failure rollback, doctor/status agreement matrix, mixed-era vault (some machines migrated, some not) resolution. [Source: architecture.md#testing-strategy]

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
