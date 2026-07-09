# Story 3.2: Handoff inbox + outbox board

## Status

Approved

## Story

**As an** engineer,
**I want** inbox and outbox lanes with status chips and one-click brief opening,
**so that** both sides of every handoff are visible (F1/F5).

## Acceptance Criteria

1. A board view shows inbox and outbox lanes per project via `handoffs.list`; each card shows from/to, objective, age, and status chip.
2. A company-wide view aggregates all registered projects (the PM view).
3. Clicking a card opens the handoff brief rendered with reading-order notes resolved inline (Epic 2 reader).
4. The board handles empty/loading states and refreshes on `vault.changed`.

## Tasks / Subtasks

- [ ] Core handler (AC: 1, 2)
  - [ ] Register `handoffs.list` → `listHandoffs(scope)` from the engine facade; scope mapping `inbox|outbox|all` per the contract
- [ ] Board UI (AC: 1, 2, 4)
  - [ ] `views/handoffs/Board.tsx`: two lanes per selected project; project switcher; company-wide toggle (all projects, grouped)
  - [ ] `components/HandoffCardView.tsx`: from → to, objective, relative age, `StatusChip` (open/consumed)
  - [ ] Empty state per lane; skeleton loading; subscribe to `vault.changed` → refetch
- [ ] Brief opening (AC: 3)
  - [ ] Card click → reader opens the handoff note; reading-order references render inline (each referenced note fetched via `vault.readNote` and rendered as an expandable section beneath the brief, links via Story 2.2 resolution)

## Dev Notes

- Data comes exclusively from `handoffs.list` (lib `listHandoffs` via PR-1). If the card needs a field the type lacks, the fix is a lib PR revision, not app-side note parsing. [Source: architecture.md#ipc-contract] [Source: architecture.md#overview]
- The board is the F1 killer's visible half — the outbox lane is the sender's first-ever view of sent handoffs. Status vocabulary is open/consumed in M1; the `StatusChip` component should render arbitrary strings so M2 states drop in without rework.
- Reading-order inline resolution addresses "one-click open of brief with reading order resolved" (F5): reuse the reader's markdown pipeline + `vault.resolveLink`; don't build a second renderer.
- Read/unread indicators are Story 3.6 (app.db) — leave a visual slot on the card, no implementation here.
- Consume actions are Story 3.4 — the card renders status only in this story.
- Files: `src/core/ipc.ts` (register), `src/renderer/src/views/handoffs/Board.tsx`, `src/renderer/src/components/HandoffCardView.tsx`, `StatusChip.tsx`, `src/renderer/src/stores/handoffs.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: scope mapping, lane grouping, company-wide aggregation, age formatting. Fixture vault gains cross-project handoffs (from Story 3.1's fixtures). Manual: board vs CLI listing parity on the fixture. [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 3 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
