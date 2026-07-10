# Story 8.2: Request/delivery chips & thread rail

## Status

Approved

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

- [ ] Kind chip (AC: 1)
  - [ ] Extend `HandoffCard` with the `REQUEST` chip (navy, beside the stamp); absent-kind default `delivery` per schema
- [ ] Thread channel (AC: 2, 4)
  - [ ] Core `src/core/threads.ts`: build the edge map from `listHandoffs` cards' `replies_to`/`fulfills` (note-name resolution via the existing shortest-path logic); walk ancestors + replies; unresolved name → diagnostic entry
  - [ ] Register `handoffs.thread` in the contract + dispatcher (derived, read-only)
- [ ] Thread rail UI (AC: 3, 5)
  - [ ] Detail view: ancestors → focused card → indented reply rail (connected cards, comments styled lighter); subscribe events for live refresh
- [ ] Tests

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

### Debug Log References

### Completion Notes List

### File List

## QA Results
