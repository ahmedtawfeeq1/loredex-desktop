# Story 1.2: Typed IPC seam

## Status

Approved

## Story

**As a** developer agent,
**I want** a single typed IPC contract with generic wrappers,
**so that** all renderer↔core traffic is compile-time checked.

## Acceptance Criteria

1. `src/shared/ipc-contract.ts` defines the `CoreApi` map and `CoreEvent` union exactly as the architecture's IPC contract (unimplemented channels may return a typed NotImplemented error).
2. Generic `invoke<K>()` (request/response) and `onEvent()` (push) wrappers exist on both sides — renderer `src/renderer/src/api.ts`, core host dispatcher `src/core/ipc.ts` — with payload types enforced at compile time.
3. The preload script exposes only the bridge (`window.loredex`) via `contextBridge`; nothing else.
4. Unknown channels or malformed payloads produce a typed error envelope, never a crash.
5. Unit tests cover request/response round-trip, error envelope, and event fan-out.

## Tasks / Subtasks

- [ ] Author the contract (AC: 1)
  - [ ] Copy the `CoreApi` map + `CoreEvent` union verbatim from the architecture IPC contract into `src/shared/ipc-contract.ts`
  - [ ] Add `src/shared/types.ts` with local stubs for types not yet exported by loredex (`HandoffCard`, `ConsumeReceipt`, `RoutePreview`, `SyncHealth`, `SyncReport`, `ActivityEvent`, `Identity`) plus app-local `Facets`, `LinkResolution`, `WizardInput`, `WizardResult` — marked with the lib PR that will replace each
  - [ ] Define the error envelope type `{ code, message, detail? }` and the `IpcCode` union (`NOT_IMPLEMENTED`, `VAULT_OUTSIDE_PATH`, `LOCK_BUSY`, `GIT_FAILED`, `PORT_CONFLICT`)
- [ ] Core-side dispatcher (AC: 2, 4)
  - [ ] `src/core/ipc.ts`: message envelope `{id, ch, arg}` → handler registry `register<K>(ch, handler)`; responses `{id, ok, out}` or `{id, ok:false, err}`
  - [ ] `emit(event: CoreEvent)` broadcast helper on the event channel
  - [ ] Unknown channel → `NOT_IMPLEMENTED` envelope; handler throw → caught, wrapped, never crashes the host
- [ ] Renderer side (AC: 2, 3)
  - [ ] `src/preload/index.ts`: receive the brokered port, expose `contextBridge.exposeInMainWorld('loredex', { invoke, onEvent })` and nothing else
  - [ ] `src/renderer/src/api.ts`: typed `invoke<K extends keyof CoreApi>` promise wrapper (correlation by id, timeout), `onEvent(cb): Unsubscribe`
  - [ ] Survive port re-broker (Story 1.1 respawn): pending invokes rejected with a retryable envelope, listeners re-attached to the new port
- [ ] Tests (AC: 5)
  - [ ] Unit tests with an in-memory MessageChannel: round-trip, unknown channel, handler throw, event fan-out to multiple listeners, port-swap recovery

## Dev Notes

- The contract text is authoritative in the architecture doc — transcribe, don't redesign. All future channels flow through this one seam; there is exactly one request channel pattern and one push event channel. [Source: architecture.md#ipc-contract]
- electron-trpc was evaluated and rejected; hand-rolled ~100–200 lines is the decision. [Source: architecture.md#ipc-contract]
- Type import rule: payloads that exist in loredex today (`Config`, `Doc`, `SearchHit`, `ProductDashboard`) are `import type from 'loredex'`; the rest are stubs in `shared/types.ts` until their lib PR lands. Never inline-duplicate payload types elsewhere. [Source: architecture.md#coding-standards]
- Errors cross the seam only as typed envelopes; no raw throws over ports. [Source: architecture.md#ipc-contract]
- Preload exposes exactly one global (`window.loredex`); new capabilities later mean new contract channels, not new bridge globals. [Source: architecture.md#coding-standards]
- Files touched: `src/shared/ipc-contract.ts`, `src/shared/types.ts`, `src/core/ipc.ts`, `src/preload/index.ts`, `src/renderer/src/api.ts` (all exist as stubs from Story 1.1). [Source: architecture.md#source-tree]

### Testing

- vitest, colocated. Simulate ports with `MessageChannel` (Node worker_threads or a tiny in-memory fake); no Electron needed for these units. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 1 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
