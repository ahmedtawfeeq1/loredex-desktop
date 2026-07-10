# Story 7.3: Reply & annotate from a handoff card

## Status

Done

## Story

**As a** recipient,
**I want** to reply to a handoff or attach a comment directly from its card,
**so that** the conversation about a handoff lives in the vault, threaded, instead of in chat.

## Acceptance Criteria

1. Every handoff card (board + detail view) exposes **Reply** and **Comment** actions (secondary navy-outline pills; the card's one gold primary stays with the lifecycle action).
2. Reply opens the Story 7.2 compose modal prefilled and locked: route inverted (from/to swapped from the parent), `replies_to` set to the parent, kind defaulted per lib rule (reply to `request` → `delivery`) but still switchable; submit invokes `handoffs.reply {parentId, input}`.
3. Comment opens a lightweight modal (title + body only) and invokes `handoffs.annotate {id, title, body}`; the result is a NEW `type: 'comment'` note — the handoff note itself is never mutated, and the comment appears in the thread rail (Story 8.2 renders the rail; this story emits correct data).
4. Both actions resolve the parent by qualified id (`<project>/<name>`) so cross-project basename collisions never mis-target; `AMBIGUOUS_HANDOFF`/`UNKNOWN_HANDOFF` envelopes render actionable errors.
5. New replies/comments appear without manual refresh via `handoff.created` events.

## Tasks / Subtasks

- [x] Card actions (AC: 1)
  - [x] Add Reply/Comment to the routing-slip card action row (board + handoff detail); keyboard-reachable, in ⌘K when a handoff is focused
- [x] Reply prefill (AC: 2, 4)
  - [x] Reuse `ComposeHandoffModal` with a `replyTo` prop: locked to-project (parent's from), banner line "Replying to <parent objective>", kind pre-set; wire `handoffs.reply`
- [x] Comment modal (AC: 3)
  - [x] `AnnotateModal.tsx` (title, body, gold Submit); wire `handoffs.annotate`; optimistic insert on `handoff.created`
- [x] Contract + core (AC: 2, 3, 4)
  - [x] Add `handoffs.reply` and `handoffs.annotate` channels; core registers both through the engine facade under the write lock, passing qualified ids
- [x] Tests
  - [x] Prefill correctness (inverted route, kind default), error-envelope rendering, event-driven insert

## Dev Notes

- Depends on Stories 7.1 (lib exports) and 7.2 (modal component). `replyToHandoff` is lib sugar — parent lookup via `listHandoffs`, throws if missing; the app must not re-implement route inversion. [Source: architecture-m2.md#2-lib-api-additions]
- `annotateHandoff` files the comment in the handoff's own `handoffs/` dir with `replies_to: id` — a comment is thread data, not a status change; do not touch `status` or attribution fields from this story. [Source: architecture-m2.md#2-lib-api-additions]
- Channel payloads: `handoffs.reply {parentId, input}` → `HandoffCreateResult`; `handoffs.annotate {id, title, body}` → `HandoffCreateResult`; both vault (lib) state. [Source: architecture-m2.md#8-ipc-additions]
- Qualified-id discipline: the board already knows each card's project — always send `<project>/<name>`; bare ids are a CLI-human affordance, not an app one. [Source: architecture-m2.md#2-lib-api-additions]
- Files: `src/renderer/src/views/board/ComposeHandoffModal.tsx` (reply variant), `src/renderer/src/views/board/AnnotateModal.tsx`, `src/renderer/src/components/HandoffCard.tsx`, `src/shared/ipc-contract.ts`, `src/core/ipc.ts`.

### Testing

- Unit: reply-prefill matrix (parent kind × direction), annotate payload, ambiguous-id error path. Integration: reply against fixture vault → new note has inverted route + `replies_to`; comment note has `type: 'comment'` and parent untouched. [Source: architecture-m2.md#2-lib-api-additions]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `src/core/compose.test.ts`: reply inverts the route + sets `replies_to` via qualified parent id; unknown parent → `UNKNOWN_HANDOFF`; annotate lands `type: 'comment'` with the parent byte-identical; blank comment rejected pre-write.
- DoD driver vs `_machine2/nimbus-vault`: reply frontmatter `{"from":"nimbus-frontend","to":"nimbus-backend","replies_to":"2026-07-10-handoff-nimbus-backend-2","status":"open","schema":2}` — the Reader renders this chain in its frontmatter panel.

### Completion Notes List

- Reply reuses `ComposeHandoffModal` with a `replyTo` ref: locked inverted route shown in a banner ("Replying to …" + mono route line), kind pre-set to delivery (lib default) but switchable; submit → `handoffs.reply {parentId, input, identity}`.
- Qualified-id discipline: `qualifiedId(card)` = `<card.to>/<card.id>` (handoffs live in projects/<to>/handoffs/); every reply/annotate invoke sends it — bare ids never leave the app.
- Comment modal (`AnnotateModal`) is title+body only → `handoffs.annotate`; the handoff note is never touched (verified byte-identical); the comment emits `handoff.created` with `card: null` + `vault.changed` (thread rail rendering is story 8.2).
- "Detail view" actions: the open reader note, when it is a handoff brief (`handoffRefFromNote`), gets the same Reply/Comment secondary pills; ⌘K offers "Reply to …"/"Comment on …" for that note.
- Card actions are navy-outline `button-small` pills in the card foot; consume keeps the lifecycle slot.

### File List

- src/renderer/src/views/handoffs/AnnotateModal.tsx (new)
- src/renderer/src/views/handoffs/ComposeHandoffModal.tsx (reply variant, in 7.2 commit)
- src/renderer/src/views/handoffs/compose-form.ts (replyCompose/buildReplyInput/handoffRefFromNote, in 7.2 commit)
- src/renderer/src/components/HandoffCardView.tsx (Reply/Comment pills)
- src/renderer/src/views/reader/NoteView.tsx (detail-view actions)
- src/shared/handoff-lanes.ts (qualifiedId, in 7.2 commit); channels/core in 7.2 commit

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC1/2: Reply reuses the compose modal (locked inverted route banner); E2E drive stage 2: reply filed under the parent's from-project with `replies_to: <parent>` on disk — inversion verified byte-level.
- AC3: annotate lands a NEW `type: 'comment'` note, parent byte-identical (`compose.test.ts`); comments ride the thread rail, never the board.
- AC4/5: qualified parent ids used throughout; `UNKNOWN_HANDOFF` typed refusal covered; event-driven insert in the handoffs store.
