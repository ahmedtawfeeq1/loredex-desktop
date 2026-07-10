# Story 8.2: Request/delivery chips & thread rail

## Status

Done

## Story

**As an** engineer,
**I want** handoff cards labeled request vs delivery and rendered as connected threads,
**so that** "who asked for what, and what answered it" reads at a glance.

## Acceptance Criteria

1. Cards with `kind: request` show a `REQUEST` navy chip beside the stamp; `kind: delivery` (and v1 notes, where `delivery` is the default-when-absent) render unchanged.
2. A `handoffs.thread {id}` channel returns `{ancestors, replies, fulfills?}` derived from `listHandoffs` + `replies_to`/`fulfills` edges in the core host — no new persistent state.
3. The handoff detail view renders the **thread rail**: replies (including `type: 'comment'` notes) as a left-indented rail of connected cards with a 2px `--hairline` connector line; ancestors render above the focused card; chains follow `replies_to` transitively.
4. Broken references (a `replies_to`/`fulfills` name that no longer resolves) render as a diagnostic chip — never auto-created, never crashing the rail.
5. Thread data refreshes on `handoff.created` / `handoff.stateChanged` / `vault.changed` events.

## Tasks / Subtasks

- [x] Kind chip (AC: 1)
  - [x] Extend `HandoffCard` with the `REQUEST` chip (navy, beside the stamp); absent-kind default `delivery` per schema
- [x] Thread channel (AC: 2, 4)
  - [x] Core `src/core/threads.ts`: build the edge map from `listHandoffs` cards' `replies_to`/`fulfills` (note-name resolution via the existing shortest-path logic); walk ancestors + replies; unresolved name → diagnostic entry
  - [x] Register `handoffs.thread` in the contract + dispatcher (derived, read-only)
- [x] Thread rail UI (AC: 3, 5)
  - [x] Detail view: ancestors → focused card → indented reply rail (connected cards, comments styled lighter); subscribe events for live refresh
- [x] Tests

## Dev Notes

- Depends on Story 7.1 (schema fields present in `HandoffCard` data). Threads/lineage state placement: `replies_to`/`fulfills` live in vault frontmatter; the thread graph is DERIVED, recomputed — nothing cached in app-db. [Source: architecture-m2.md#8-ipc-additions]
- Channel shape: `handoffs.thread {id}` → `{ancestors: HandoffCard[], replies: HandoffCard[], fulfills?: HandoffCard}`. [Source: architecture-m2.md#8-ipc-additions]
- Note-name resolution for `replies_to`/`fulfills` uses the SAME vault-wide shortest-path rule as reading-order wikilinks (Story 2.2 core logic) — reuse `vault.resolveLink` machinery, don't fork it. [Source: architecture-m2.md#1-handoff-schema-v2]
- Thread rail and `REQUEST` chip visuals are specified in the v2 card spec. Comments (`type: 'comment'`) are rail members, not board-lane cards — keep them out of inbox/outbox lanes. [Source: DESIGN.md#signature-routing-slip-handoff-card]
- `fulfills` rendering here is the *link display only* — creating fulfills links and the fulfilled badge are Story 8.3.
- Files: `src/core/threads.ts`, `src/shared/ipc-contract.ts`, `src/core/ipc.ts`, `src/renderer/src/views/board/HandoffDetail.tsx`, `src/renderer/src/components/HandoffCard.tsx`.

### Testing

- Unit: edge-map construction (chains, comments, missing refs, cross-project name resolution), ancestor/reply walks with cycles guarded. Integration: fixture vault with a request → delivery → comment chain; assert rail order and diagnostic on a dangling `replies_to`. [Source: architecture-m2.md#2-lib-api-additions]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- `npx vitest run src/core/threads.test.ts` — 10/10 (edge model + seam chain)
- `npm run typecheck && npm test && npm run build` — 34 files / 203 tests green

### Completion Notes List

- Contract evolution: the m2 sketch says `HandoffCard[]`, but comments are rail members and not HandoffCards — the channel serves a `ThreadCard` projection (vault-relative paths for the reader, comments with `status: ''`/`kind: 'comment'`), plus additive `broken` diagnostics and `fulfilledBy` (the reverse fulfills edge, populated here because it IS the edge model; story 8.3 renders it).
- Name resolution reuses `links.resolveLink` (story 2.2 shortest-path) via injection — ambiguous names count as unresolved (diagnostic), never guessed.
- Cycle guard: a corrupted `replies_to` loop truncates the walk; a node never appears twice (ancestor wins over rail).
- Comments scan = `listMarkdownFiles` filtered to `projects/*/handoffs/` minus board-card paths, `type: 'comment'` only; unreadable notes skipped, never fatal. Recomputed per request — nothing persisted (state-placement rule).
- The detail view is the reader's open handoff brief (same seam as stories 7.3/8.1) — `ThreadRail` mounts under `NoteView`, not a new `HandoffDetail.tsx`; files live in `views/handoffs/` (existing seam, never restructured).
- Design-fidelity test updated: DESIGN v2 itself sanctions the thread rail's 2px `--hairline` connector; the border-width guard now allows exactly that declaration.

### File List

- src/shared/types.ts — `ThreadCard`/`ThreadReply`/`BrokenThreadRef`/`HandoffThread`
- src/shared/ipc-contract.ts — `handoffs.thread` channel
- src/core/threads.ts — NEW: edge model, ancestor/reply walks, comment scan
- src/core/threads.test.ts — NEW: pure matrix + seam integration chain
- src/core/handlers.ts — `handoffs.thread` handler (derived, read-only)
- src/renderer/src/views/handoffs/ThreadRail.tsx — NEW: rail UI + live refresh
- src/renderer/src/views/reader/NoteView.tsx — mounts the rail on handoff briefs
- src/renderer/src/components/HandoffCardView.tsx — REQUEST chip beside the stamp
- src/renderer/src/styles.css — `.thread*` rail/connector/diagnostic styles
- src/renderer/src/design-fidelity.test.ts — sanction the 2px hairline connector

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC1: REQUEST navy chip (`chip-request`) beside the stamp; deliveries and v1 notes unchanged.
- AC2/3: `handoffs.thread` derived core-side (`threads.test.ts`: ancestors walk, depth-first rail, comments included); ThreadRail rendered under the focused card in the Reader.
- AC4: broken `replies_to`/`fulfills` refs render as diagnostic chips, never crash the rail (unit-covered).
- AC5: E2E drive: thread refetched over the seam shows the reply immediately after `handoff.created`.
