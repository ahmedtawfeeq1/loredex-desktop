# Story 1.2: Typed IPC seam

## Status

Done

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

- [x] Author the contract (AC: 1)
  - [x] Copy the `CoreApi` map + `CoreEvent` union verbatim from the architecture IPC contract into `src/shared/ipc-contract.ts`
  - [x] Add `src/shared/types.ts` with local stubs for types not yet exported by loredex (`HandoffCard`, `ConsumeReceipt`, `RoutePreview`, `SyncHealth`, `SyncReport`, `ActivityEvent`, `Identity`) plus app-local `Facets`, `LinkResolution`, `WizardInput`, `WizardResult` — marked with the lib PR that will replace each
  - [x] Define the error envelope type `{ code, message, detail? }` and the `IpcCode` union (`NOT_IMPLEMENTED`, `VAULT_OUTSIDE_PATH`, `LOCK_BUSY`, `GIT_FAILED`, `PORT_CONFLICT`)
- [x] Core-side dispatcher (AC: 2, 4)
  - [x] `src/core/ipc.ts`: message envelope `{id, ch, arg}` → handler registry `register<K>(ch, handler)`; responses `{id, ok, out}` or `{id, ok:false, err}`
  - [x] `emit(event: CoreEvent)` broadcast helper on the event channel
  - [x] Unknown channel → `NOT_IMPLEMENTED` envelope; handler throw → caught, wrapped, never crashes the host
- [x] Renderer side (AC: 2, 3)
  - [x] `src/preload/index.ts`: receive the brokered port, expose `contextBridge.exposeInMainWorld('loredex', { invoke, onEvent })` and nothing else
  - [x] `src/renderer/src/api.ts`: typed `invoke<K extends keyof CoreApi>` promise wrapper (correlation by id, timeout), `onEvent(cb): Unsubscribe`
  - [x] Survive port re-broker (Story 1.1 respawn): pending invokes rejected with a retryable envelope, listeners re-attached to the new port
- [x] Tests (AC: 5)
  - [x] Unit tests with an in-memory MessageChannel: round-trip, unknown channel, handler throw, event fan-out to multiple listeners, port-swap recovery

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

Claude Fable 5 (claude-fable-5) — BMAD dev agent

### Debug Log References

- `npm run typecheck` green; `npm test` 11 passing (2 files); `npm run build` green.

### Completion Notes List

- Contract transcribed verbatim (CoreApi map + CoreEvent union) into `src/shared/ipc-contract.ts` with wire protocol (`req`/`res`/`evt` + story-1.1 `ping`/`pong` liveness), error envelope, guards, and `PortLike` abstraction.
- `src/shared/types.ts` holds lib-PR stubs (HandoffCard, ConsumeReceipt, RoutePreview, SyncHealth, SyncReport, ActivityEvent, Identity — each marked with its PR) plus permanent app-local view types (Facets, LinkResolution, WizardInput, WizardResult).
- DEVIATION: `IpcCode` extended beyond the architecture's five codes with `INTERNAL` (non-envelope handler throw), `TIMEOUT`, `PORT_SWAPPED` (retryable, port re-broker), `NO_CONFIG` (used by story 1.3 when no config is resolved yet). The architecture says codes "include" the five, so this is an allowed extension.
- DEVIATION (file placement): the client wrapper lives in `src/shared/ipc-client.ts` (not in the architecture source tree) because the preload owns the port — correlation/timeout/port-swap logic must run there, and shared placement keeps it unit-testable in plain node. `src/renderer/src/api.ts` is the thin typed re-export over `window.loredex`.
- Temporary local stubs for `Config`/`Doc`/`SearchHit`/`ProductDashboard` in the contract — story 1.3 replaces them with `import type from 'loredex'`.
- Port swap: pending invokes rejected with `PORT_SWAPPED` + `detail.retryable: true`; pre-attach invokes are buffered and flushed on first attach; event listeners live in the client so they survive swaps.

### File List

- src/shared/ipc-contract.ts (rewritten: full contract + wire protocol + envelope + PortLike)
- src/shared/types.ts (new)
- src/shared/ipc-client.ts (new — client wrapper used by preload)
- src/core/ipc.ts (new — dispatcher + event fan-out)
- src/core/index.ts (attaches brokered ports to the dispatcher)
- src/preload/index.ts (contextBridge exposes window.loredex only)
- src/renderer/src/api.ts (new — typed invoke/onEvent)
- src/shared/ipc-contract.test.ts, src/core/ipc.test.ts (11 tests)

## QA Results

**Verdict: PASS** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1/AC2: code-verified + compile-checked — `src/shared/ipc-contract.ts` CoreApi/CoreEvent, typed `invoke`/`onEvent` on both sides; typecheck green enforces payload types.
- AC3: code-verified — preload exposes only the `window.loredex` bridge via `contextBridge`.
- AC4/AC5: verified by unit tests — `ipc.test.ts` / `ipc-contract.test.ts` cover round-trip, error envelope (unknown channel/malformed payload), event fan-out, port-swap buffering.
- Recorded deviations (extra IpcCodes, `ipc-client.ts` placement) are documented in the Dev Agent Record and are sound.
