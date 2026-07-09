# Story 1.5: loredex PR-5 + PR-8 — async git & injectable events (loredex repo)

## Status

Approved

## Story

**As a** desktop core host,
**I want** async git variants with a structured SyncReport and an injectable event emitter in loredex,
**so that** slow git operations don't serialize the engine and the app can observe engine events.

## Acceptance Criteria

1. loredex exposes async variants of the `core/router.ts` git calls; the async sync path returns a structured, exported `SyncReport`.
2. loredex accepts an injectable typed event emitter; lib operations emit route/consume/store/sync events; the default emitter is a no-op so CLI behavior is unchanged.
3. Both changes carry unit tests in the loredex repo and pass its regression suite.
4. A loredex release is published and the desktop repo bumps its exact pin.

## Tasks / Subtasks

- [ ] PR-5: async git (AC: 1)
  - [ ] In the loredex repo, add async (`execFile`-promise) variants alongside the existing `execFileSync` git calls in `core/router.ts`; sync variants remain for CLI compatibility
  - [ ] Define and export `SyncReport` (per-operation results: pulled/pushed/conflicts/warnings, stderr text captured — warnings must be carried, never dropped)
  - [ ] `gitPullPush` async path returns `SyncReport`
- [ ] PR-8: injectable event emitter (AC: 2)
  - [ ] Add a typed emitter interface (route/consume/store/sync event payloads) accepted via lib init/options; default implementation is a no-op
  - [ ] Emit from `storeNote`, routing, consume (when it lands in PR-2 it reuses this), and sync paths
  - [ ] Export the emitter types from `lib.ts`
- [ ] Quality gates (AC: 3)
  - [ ] Unit tests for both PRs in the loredex repo; full loredex regression suite green; CLI output byte-identical for default (no-emitter, sync) paths
- [ ] Release + pin bump (AC: 4)
  - [ ] Publish a loredex release (conventional commits / release-please per that repo's flow)
  - [ ] In `loredex-desktop`: bump the exact pin, rerun `tests/pinned-release.test.ts`, note the version in File List

## Dev Notes

- **Repo:** this story's code lands in the sibling `loredex` repo (the published npm lib), not the desktop app. Follow that repo's own conventions (it already uses vitest + conventional commits). Only the pin bump touches the desktop repo.
- Motivation: risk 6 — `execFileSync` serializes the core host (a slow `git pull` would block MCP responses); the poller (Story 3.5) and `sync.run` need the async path + structured report. [Source: architecture.md#remote-event-poller--write-lock]
- `SyncReport` and the emitter types become IPC payloads — they must be exported from `lib.ts` so the desktop contract can `import type` them (replacing stubs in `src/shared/types.ts`). [Source: architecture.md#ipc-contract] [Source: architecture.md#loredex-library-surface]
- Never swallow stderr in the report — surfacing git warnings is a product requirement (F8). [Source: architecture.md#git-strategy]
- The emitter is how the core host fans engine activity out to `CoreEvent`s later; design payloads to map cleanly onto `route.completed` / `sync.changed` events. [Source: architecture.md#ipc-contract]
- Keep both PRs additive: zero behavior change for existing CLI users (default no-op emitter, sync functions untouched).

### Testing

- Tests live in the loredex repo per its layout; cover: async variant parity with sync results, SyncReport warning capture from a fixture repo with stderr noise, emitter receives events in order, no-op default emits nothing. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 1 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

- PARTIAL (PR-8 subset only, landed as a prerequisite of epic3.story3): injectable typed emitter in `loredex/src/core/events.ts` (`LoredexEmitter`, `LoredexEventMap`, `setLoredexEmitter`, `noopEmitter`, `Identity`) with emissions from route (`executePlan`), `storeNote`, consume, and `gitPullPush`; default no-op keeps CLI byte-identical; exported from `lib.ts`; tests in `tests/events.test.ts` (loredex commit 99a134d).
- PR-5 (async git variants + `SyncReport`) NOT implemented — none of the four v0.1 lib exports need it; story remains open for that half.

### File List

## QA Results
