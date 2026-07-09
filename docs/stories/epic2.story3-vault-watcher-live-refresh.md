# Story 2.3: Vault watcher & live refresh

## Status

Approved

## Story

**As a** reader,
**I want** the UI to reflect vault changes live,
**so that** CLI/agent writes appear without restarting the app.

## Acceptance Criteria

1. The core host subscribes to the vault with `@parcel/watcher` (FSEvents), ignoring `.git/**`, with debounce.
2. `vault.changed` CoreEvents push changed paths; the open note and file tree refresh live.
3. After a `git pull` event storm, state is reconciled from filesystem + git truth — cached per-file events are never trusted (F4 rule).
4. CI gains a native-module smoke test: watcher subscribe/emit against the packaged Electron ABI, rerun on every Electron and module bump.

## Tasks / Subtasks

- [ ] Watcher subscription (AC: 1)
  - [ ] `npm i -E @parcel/watcher` (2.5.x)
  - [ ] `src/core/watcher.ts`: `subscribe(vaultPath, cb, { ignore: ['.git/**'] })`; debounce bursts (~250 ms window) into one batch
- [ ] Event fan-out (AC: 2)
  - [ ] Emit `{ kind: 'vault.changed', paths }` via `src/core/ipc.ts` `emit()`
  - [ ] Renderer: reader store `invalidate()` on affected paths — reload open note if listed, refresh tree, rebuild the Story 2.2 link index (core-side hook)
- [ ] Storm reconcile (AC: 3)
  - [ ] Detect storm/overflow (large batch or watcher error): instead of trusting per-file events, re-walk the vault + emit a single full-refresh `vault.changed` with the recomputed diff; expose `reconcile()` for the poller (Story 3.5) to call after integrates
- [ ] Native smoke CI (AC: 4)
  - [ ] `tests/native-smoke/watcher.test.ts`: subscribe to a temp dir, touch a file, assert the event — executed against the **packaged** Electron ABI (run via `electron` binary or `electron-rebuild`-verified module), wired as a dedicated `ci.yml` job

## Dev Notes

- `@parcel/watcher` is the decided watcher (FSEvents, darwin-arm64 prebuilds, VS Code precedent). Ignore `.git/**` always — git plumbing churn must not become UI events. [Source: architecture.md#tech-stack]
- The F4 rule is load-bearing: after pull storms, reconcile from filesystem + git truth; never trust cached per-file events. The `reconcile()` entry point built here is exactly what the remote-event poller calls after every integrate. [Source: architecture.md#remote-event-poller--write-lock] [Source: architecture.md#coding-standards]
- Watcher snapshots (`writeSnapshot`/`getEventsSince`) are NOT this story — they arrive with the changed-since-brief diff (Story 2.6). Keep `watcher.ts` shaped to add them (single module owning all @parcel/watcher API use).
- ABI churn is risk 5: the smoke test exists so an Electron major bump that breaks the prebuild fails CI, not users. Story 3.6 adds better-sqlite3 to the same job. [Source: architecture.md#testing-strategy]
- Files: `src/core/watcher.ts`, `src/core/index.ts` (start after engine init), `src/core/links.ts` (index rebuild hook), `src/renderer/src/stores/reader.ts`, `tests/native-smoke/watcher.test.ts`, `.github/workflows/ci.yml`. [Source: architecture.md#source-tree]

### Testing

- Unit: debounce batching, storm-detection threshold, ignore rules. Native smoke as above (real FSEvents on the macOS runner). [Source: architecture.md#testing-strategy]

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
