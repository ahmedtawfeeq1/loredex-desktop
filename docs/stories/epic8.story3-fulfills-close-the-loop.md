# Story 8.3: Fulfills linking — close the loop

## Status

Approved

## Story

**As a** sender of a delivery,
**I want** to mark which open request my delivery fulfills,
**so that** requests visibly close instead of lingering open forever.

## Acceptance Criteria

1. The compose modal (Story 7.2), when kind = `delivery`, offers an optional **"Fulfills a request…"** picker listing OPEN `kind: request` handoffs addressed to the sending project (qualified ids, objective + age shown); selection sets `fulfills` on the created note.
2. An existing delivery card without `fulfills` offers a "Link to request…" action opening the same picker; confirming creates the link via the lib (annotate-style comment naming the fulfillment is acceptable only if the lib exposes no update path — otherwise the compose-time field is the write path and retro-linking is compose-a-reply guidance; the story implements whichever PR-11 shipped, no app-side frontmatter writes).
3. A request that any delivery `fulfills` shows a **fulfilled badge** (`--ok` tint chip "FULFILLED by <name>") on its card and detail view, derived from the thread edge model — the request's own `status` is NOT auto-written.
4. The Story 8.2 thread rail shows the fulfills link as a distinct connector (labeled edge to the request card).
5. The picker never lists consumed/declined requests; empty state is one serif sentence + no action noise.

## Tasks / Subtasks

- [ ] Compose integration (AC: 1, 5)
  - [ ] `FulfillsPicker.tsx`: searchable list from `handoffs.list` filtered `kind=request`, `status=open|accepted`, to-project = my project; wires `fulfills` into `CreateHandoffInput`
- [ ] Retro-link path (AC: 2)
  - [ ] Card action per the shipped PR-11 surface; if compose-time only, the action deep-links into a prefilled reply-with-fulfills compose
- [ ] Fulfilled badge (AC: 3, 4)
  - [ ] Derive `fulfilledBy` in the thread/edge builder (Story 8.2 `threads.ts`); render the badge chip on request cards + the labeled connector in the rail
- [ ] Tests

## Dev Notes

- Depends on Stories 7.1, 7.2, 8.2. `fulfills` is a create-time field of `CreateHandoffInput` (note name of the request); values resolve vault-wide via shortest-path. [Source: architecture-m2.md#2-lib-api-additions] [Source: architecture-m2.md#1-handoff-schema-v2]
- Anti-second-engine rule is the hard boundary on AC 2: the app must not write frontmatter itself; if PR-11 has no "set fulfills on existing note" export, retro-linking routes through compose (reply carrying `fulfills`) — record the chosen path in the Dev Agent Record. [Source: architecture-m2.md#2-lib-api-additions]
- The fulfilled badge is DERIVED (thread graph), never a status write — closing the request for real is the recipient consuming/accepting it; suggesting that is Epic 12's toast, not this story. [Source: architecture-m2.md#8-ipc-additions]
- `--ok` is status-only in v2 — correct for the FULFILLED chip; don't spend gold here. [Source: DESIGN.md#tokens]
- Files: `src/renderer/src/views/board/FulfillsPicker.tsx`, `src/core/threads.ts` (fulfilledBy), `src/renderer/src/components/HandoffCard.tsx`, `src/renderer/src/views/board/HandoffDetail.tsx`.

### Testing

- Unit: picker filter matrix (kind × status × direction), badge derivation (one/many deliveries, dangling fulfills). Integration: compose a delivery fulfilling a fixture request → request card shows FULFILLED, rail shows the labeled edge. [Source: architecture-m2.md#2-lib-api-additions]

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
