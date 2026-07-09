# Story 4.2: Route receipt UI, undo & dedupe merge

## Status

Approved

## Story

**As an** engineer,
**I want** every route to show a receipt with undo and duplicate reconciliation,
**so that** routing mistakes are recoverable in one click (F4).

## Acceptance Criteria

1. Every route (manual or watcher-triggered) surfaces a receipt card: file → exact destination plus the invented-frontmatter diff, driven by `route.preview` / `route.completed` events.
2. One-click undo calls `route.undo` and restores prior state, indexes included.
3. Content-hash dedupe detects watcher/manual race duplicates and offers a one-click merge — no hand-editing "do not edit" indexes.
4. A receipt history view lists recent routes with their outcomes.

## Tasks / Subtasks

- [ ] Core handlers (AC: 1, 2)
  - [ ] Register `route.preview` → `planRoute(file)` and `route.undo` → `undoRoute(receiptId)` (both via engine facade, apply/undo under the write lock)
  - [ ] Wire the PR-8 route events → `route.completed` CoreEvent push (covers CLI/agent-initiated routes too — the app observes ALL routes, not just its own)
- [ ] Receipt UI (AC: 1, 2)
  - [ ] `views/routes/ReceiptToast.tsx`: on `route.completed` — source → destination, frontmatter diff (added keys highlighted as "invented"), Undo button
  - [ ] Undo failure (superseded receipt) → explanatory error, link to history
- [ ] Dedupe merge (AC: 3)
  - [ ] On `route.completed`, compare content hash against recent receipts (`.loredex/receipts/` read via a core-host listing handler `route.history`); duplicate detected → merge card offering keep-one + undo-other, executed via lib undo (never hand-editing index files)
- [ ] History (AC: 4)
  - [ ] Add `route.history { in: { limit?: number }; out: Receipt[] }` contract channel reading persisted receipts; `views/routes/History.tsx` lists them with outcome + undo availability

## Dev Notes

- Depends on Story 4.1's pin bump (`planRoute`/`applyRoute`/`undoRoute`, `RoutePreview`, persisted receipts) — no app-side route writes ever. [Source: architecture.md#loredex-library-surface] [Source: architecture.md#overview]
- `route.completed` events come from the lib emitter through the poller/watcher-independent path (local ops emit directly); watcher-triggered CLI routes surface because receipts land in `.loredex/receipts/` and the emitter fires in whichever process ran them — for CLI-side routes the app learns via `vault.changed` on the receipts dir; handle both sources, dedupe by receipt id. [Source: architecture.md#ipc-contract]
- "Invented frontmatter" highlighting is the F4 consent surface: what the router made up must be visually distinct from what the author wrote.
- All lib write calls (apply, undo, merge) go through `withWriteLock` (Story 3.5). [Source: architecture.md#coding-standards]
- New contract channel `route.history` follows the one-seam rule — add to `ipc-contract.ts`. [Source: architecture.md#ipc-contract]
- Files: `src/core/ipc.ts` (register 3 channels), `src/core/engine.ts`, `src/renderer/src/views/routes/ReceiptToast.tsx`, `History.tsx`, `src/renderer/src/stores/routes.ts`, `src/shared/ipc-contract.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: diff rendering (invented vs existing keys), hash-collision merge offer, receipt-id dedupe across event sources. Integration: route a fixture file → receipt → undo → byte-identical vault (assert with git status clean). [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 4 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
