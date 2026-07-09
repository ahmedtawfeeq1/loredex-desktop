# Story 3.2: Handoff inbox + outbox board

## Status

Done

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

- [x] Core handler (AC: 1, 2)
  - [x] Register `handoffs.list` → `listHandoffs(scope)` from the engine facade; scope mapping `inbox|outbox|all` per the contract
- [x] Board UI (AC: 1, 2, 4)
  - [x] `views/handoffs/Board.tsx`: two lanes per selected project; project switcher; company-wide toggle (all projects, grouped)
  - [x] `components/HandoffCardView.tsx`: from → to, objective, relative age, `StatusChip` (open/consumed)
  - [x] Empty state per lane; skeleton loading; subscribe to `vault.changed` → refetch
- [x] Brief opening (AC: 3)
  - [x] Card click → reader opens the handoff note; reading-order references render inline (each referenced note fetched via `vault.readNote` and rendered as an expandable section beneath the brief, links via Story 2.2 resolution)

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

Claude Fable 5 (claude-fable-5), BMAD dev agent

### Debug Log References

- `npm run typecheck` clean; `npm test` 11 files / 48 tests green; `npm run build` (electron-vite) green.

### Completion Notes List

- `handoffs.list` registered in the core host → `engine.handoffs()` → lib `listHandoffs` (sole loredex import site preserved). Contract in-shape evolved app-locally with an optional `project` qualifier so inbox/outbox map onto the lib's `HandoffScope` semantics (direction relative to a project; company-wide without one).
- Board fetches company-wide once (`scope: 'all'`) and derives lanes in pure view logic (`src/shared/handoff-lanes.ts` — placed in shared, not views/, so core-side vitest exercises exactly what the renderer renders; deviation from the story's file list, reason: tsconfig project boundaries node/web).
- Per-project lanes + project switcher tabs + company-wide grouped (PM) view; skeleton loading, per-lane serif empty states; refetch on `vault.changed`/`handoff.new`/`handoff.stateChanged` events (no watcher in v0.1 — events arrive from local ops and the story 3.7 refresh check).
- Routing-slip card per DESIGN.md: stamp chip (`StatusChip` renders arbitrary status strings), mono route line `from ⟶ to` with right-aligned date, serif objective, mono footer with note count + age. Read-state slot left for 3.6 (`consumeSlot` prop is the 3.4 seam).
- Card click opens the brief in the reader; reading-order targets (lib-parsed `HandoffCard.readingOrder`) render inline beneath the note as expandable sections via the story-2.2 resolution caches + the sanctioned markdown pipeline (no second renderer).
- Fixture vault gained cross-project handoffs under `projects/*/handoffs/` (lib collector only walks those dirs). Board assembly additionally asserted against the real nimbus simulation vault (skipped when absent).

### File List

- `src/shared/ipc-contract.ts` (handoffs.list in-shape: optional project)
- `src/shared/handoff-lanes.ts` (new — pure lane assembly; + `.test` coverage via core test)
- `src/core/engine.ts` (`handoffs`, `registeredProjects`)
- `src/core/handlers.ts` (register handoffs.list)
- `src/core/handoffs.test.ts` (new — seam + lanes tests, fixture + nimbus vault)
- `src/renderer/src/stores/handoffs.ts` (new)
- `src/renderer/src/stores/reader.ts` (readingOrder ride-along)
- `src/renderer/src/stores/app.ts` (view switching)
- `src/renderer/src/views/handoffs/Board.tsx` (new)
- `src/renderer/src/views/handoffs/ReadingOrderInline.tsx` (new)
- `src/renderer/src/components/HandoffCardView.tsx`, `StatusChip.tsx` (new)
- `src/renderer/src/views/reader/NoteView.tsx` (reading order mount)
- `src/renderer/src/App.tsx` (Handoffs nav + badge slot)
- `src/renderer/src/styles.css` (board + routing-slip card + reading order)
- `tests/fixtures/vault/projects/nimbus-web/handoffs/*.md`, `tests/fixtures/vault/projects/nimbus-api/handoffs/*.md` (new fixtures)

## QA Results

**Verdict: PASS with concerns** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1: verified — `handoffs.list` → `engine.handoffs` → lib `listHandoffs`; lane derivation pure and unit-tested (`handoffs.test.ts`, `handoff-lanes`); routing-slip card matches DESIGN.md (stamp chip, mono `from ⟶ to` (U+27F6) + right-aligned date, serif objective, mono footer).
- AC2: verified — company-wide grouped view assembled against the real nimbus vault in tests.
- AC3: code-verified, not UI-verified — card click opens the brief with reading-order notes inline (`ReadingOrderInline` via story-2.2 caches).
- AC4: code-verified — skeleton/empty states + refetch on `vault.changed`/`handoff.*` events.
- **Concern** — duplicate `HandoffCard.id` across projects collides React keys and consume targeting (known lib action item).
