# Story 8.3: Fulfills linking — close the loop

## Status

Done

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

- [x] Compose integration (AC: 1, 5)
  - [x] `FulfillsPicker.tsx`: searchable list from `handoffs.list` filtered `kind=request`, `status=open|accepted`, to-project = my project; wires `fulfills` into `CreateHandoffInput`
- [x] Retro-link path (AC: 2)
  - [x] Card action per the shipped PR-11 surface; if compose-time only, the action deep-links into a prefilled reply-with-fulfills compose
- [x] Fulfilled badge (AC: 3, 4)
  - [x] Derive `fulfilledBy` in the thread/edge builder (Story 8.2 `threads.ts`); render the badge chip on request cards + the labeled connector in the rail
- [x] Tests

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

Claude Fable 5 (claude-fable-5)

### Debug Log References

- `npx vitest run src/core/threads.test.ts` — 11/11 incl. fulfills-both-ways integration
- `npm run typecheck && npm test && npm run build` — 34 files / 208 tests green

### Completion Notes List

- **Retro-link path chosen (AC2):** PR-11 ships NO "set fulfills on existing note" export, so per the story's own fallback the "Link request" action on a fulfills-less outbound delivery opens a picker modal, then deep-links into a prefilled reply-with-fulfills compose targeting the picked request (`replies_to` from the reply seam + `fulfills` prefilled; body references the earlier delivery as a wikilink). The existing delivery's frontmatter is never rewritten — anti-second-engine holds.
- Picker filter: `kind=request`, `status ∈ {open, accepted}`, `to === fromProject` (task list wording); snoozed requests are therefore excluded along with consumed/declined (AC5 names only the latter two — recorded as the stricter reading). Empty state is one serif sentence, zero buttons.
- `fulfilledBy` was derived in threads.ts in story 8.2 (it IS the edge model); this story renders it: `--ok` FULFILLED chip on request board cards (`fulfilledByMap`, id-match — note names are vault-unique via lib uniquePath) and the labeled `fulfilled ⟵ by` connector block in the rail. The request's `status` is never auto-written (integration test asserts it stays `open`).
- Bug fixed en route: `announceCreated` now invalidates the core link index — thread edges resolve new notes immediately instead of waiting for a renderer tree refresh.
- `fulfills` is dropped from the payload when kind = request (field is delivery-semantics only).

### File List

- src/renderer/src/views/handoffs/FulfillsPicker.tsx — NEW: picker + LinkRequestModal (retro-link)
- src/renderer/src/views/handoffs/compose-form.ts — `fulfills` state/payload, `fulfillsCandidates`
- src/renderer/src/views/handoffs/compose-form.test.ts — filter matrix, payload, fulfilledByMap
- src/renderer/src/views/handoffs/ComposeHandoffModal.tsx — Fulfills row (delivery kind), prefill merge
- src/renderer/src/stores/handoffs.ts — composePrefill, linkRequestFor open/close
- src/shared/handoff-lanes.ts — `fulfilledByMap`
- src/renderer/src/components/HandoffCardView.tsx — FULFILLED chip + Link request action
- src/renderer/src/views/handoffs/Board.tsx — wiring (outbound deliveries, badge map)
- src/renderer/src/views/handoffs/ThreadRail.tsx — `fulfilled ⟵ by` labeled connector
- src/renderer/src/App.tsx — mount LinkRequestModal
- src/renderer/src/styles.css — `.chip-fulfilled`, `.fulfills-empty`
- src/core/handlers.ts — link-index invalidation on create
- src/core/threads.test.ts — fulfills both-ways integration

## QA Results
