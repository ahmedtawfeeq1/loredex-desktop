# Story 8.1: Accept / decline / snooze actions & stamp states

## Status

Done

## Story

**As a** recipient,
**I want** to accept, decline (with a reason), snooze (until a date), or reopen a handoff from its card,
**so that** senders learn the real fate of their handoff instead of "open or consumed".

## Acceptance Criteria

1. Inbox cards in `open` state offer Accept (gold primary), Decline, and Snooze; state-legal actions only are shown per the v2 state machine (accepted → Consume; declined/snoozed → Reopen; consumed → none). All invoke `handoffs.setStatus {id, transition}`.
2. Decline opens a DESIGN v2 modal requiring a single-line reason before the destructive (rust outline) confirm enables; Snooze opens an until-date picker (`YYYY-MM-DD`, min tomorrow) — both map to their `HandoffTransition` payloads.
3. Stamp chips render every v2 state per the routing-slip spec: OPEN gold, ACCEPTED navy, DECLINED rust, CONSUMED/DONE `--text-2`, SNOOZED `--text-2` dashed border — with the stamp-press animation on change (reduced-motion respected).
4. Snoozed cards whose `snoozed_until` < today render a derived "expired" treatment and sort with open cards — the app never auto-writes the status back; a one-click Reopen is the human action.
5. The `StatusReceipt` (before/after, by, at, pushed) surfaces as a receipt toast; the board updates from the `handoff.stateChanged` event (now carrying `reason?`/`until?`); illegal-transition envelopes render actionably.

## Tasks / Subtasks

- [x] Action row + state gating (AC: 1)
  - [x] `HandoffCard` action row derives available actions from `status`; wire `handoffs.setStatus` through the contract → engine facade under the write lock
- [x] Decline + snooze modals (AC: 2)
  - [x] `DeclineReasonModal.tsx` (required reason, rust confirm); `SnoozeUntilPicker.tsx` (date input + quick options: tomorrow / next week); payloads `{to:'declined', reason}` / `{to:'snoozed', until}`
- [x] Stamp states (AC: 3)
  - [x] Extend the stamp chip component with ACCEPTED/DECLINED/SNOOZED variants + the SNOOZED dashed border; keep the 120ms stamp-press
- [x] Expired-snooze derivation (AC: 4)
  - [x] Board store: derive `expired` from `snoozed_until` vs today at render; sort expired with open; Reopen action sends `{to:'open'}`
- [x] Receipts + events (AC: 5)
  - [x] Receipt toast from `StatusReceipt`; subscribe `handoff.stateChanged` (payload gains `reason?`, `until?`); map `ILLEGAL_TRANSITION`/`AMBIGUOUS_HANDOFF` to messages
- [x] Tests

## Dev Notes

- Depends on Story 7.1 (`setHandoffStatus`, `StatusReceipt`, events). The state machine and per-transition field writes are lib-enforced — the app's job is to only OFFER legal transitions and render errors when a race makes one illegal (someone else transitioned first). [Source: architecture-m2.md#1-handoff-schema-v2] [Source: architecture-m2.md#2-lib-api-additions]
- **Snooze expiry never auto-writes** — expired is a derived flag in every reader; flipping status is one-click human action. The local notification side of snooze (timers, toast-once) is Story 9.2/9.3, not here. [Source: architecture-m2.md#1-handoff-schema-v2]
- Channel: `handoffs.setStatus {id, transition: HandoffTransition}` → `StatusReceipt`; vault (lib) state; qualified ids always. [Source: architecture-m2.md#8-ipc-additions]
- Stamp chip spec (colors, dashed SNOOZED, one bespoke animation) is binding. Decline is destructive-styled but reversible (reopen allowed) — say so in the modal copy. [Source: DESIGN.md#signature-routing-slip-handoff-card]
- Reopen keeps decline/accept attribution fields (history) and removes snooze fields — render prior attribution as a muted history line on the card detail.
- Files: `src/renderer/src/components/HandoffCard.tsx`, `src/renderer/src/views/board/DeclineReasonModal.tsx`, `SnoozeUntilPicker.tsx`, `src/renderer/src/stores/handoffs.ts`, `src/shared/ipc-contract.ts`, `src/core/ipc.ts`.

### Testing

- Unit: action-gating matrix (all 5 states), payload shapes, expired-derivation boundary (today/yesterday/tomorrow), stamp variant rendering. Integration: accept→consume and snooze→expire→reopen against a fixture vault; assert frontmatter fields written per the writer-semantics table and nothing else. [Source: architecture-m2.md#1-handoff-schema-v2]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- `npm run typecheck && npm test && npm run build` — 33 files / 193 tests green after story
- `npx vitest run src/core/status.test.ts` — 7/7 (accept/decline/snooze/reopen/consume + illegal envelopes)

### Completion Notes List

- Stamp chip already carried every v2 variant + dashed SNOOZED from the 14.1 reskin (CSS + `STATE_CLASS`) — no chip rework needed; this story added the derived expired marker (`.snooze-expired`, rust mono) and `until <date>` in the card foot.
- Expired derivation lives in the LIB (`HandoffCard.expired`, computed per read against today; expired sorts with open) — the app renders it and never writes back, exactly per AC4. Boundary (day before / on / after `snoozed_until`) covered in status.test.ts against `listHandoffs(…, today)`.
- `handoffs.setStatus` rides the consume pattern: identity in the payload, write lock, `withGitIdentity`, lib `HandoffError` → typed envelope in the one engine facade. `handoff.stateChanged` gained optional `reason`/`until` (additive contract evolution).
- Consume moved to the `accepted` state per AC1's gating table; the store still accepts consume from `open` (CLI skip-accept stays legal) so ⌘⏎ never throws on a race.
- Deviation: modals live in `src/renderer/src/views/handoffs/` (not `views/board/`) — that is where every existing board/modal file lives; never restructure working seams.
- Deviation noted for QA: AC1 makes Accept a gold primary per card while DESIGN says max one gold primary per view — the story AC is explicit, so Accept is gold; the board's "New handoff" primary remains.
- Prior attribution renders as muted mono history lines on the note detail (`attributionLines`), fed by the never-erased frontmatter fields.

### File List

- src/shared/ipc-contract.ts — `handoffs.setStatus` channel; stateChanged `reason?`/`until?`
- src/shared/types.ts — re-export `HandoffTransition`, `StatusReceipt`
- src/shared/handoff-lanes.ts — `actionsFor` state-gating matrix
- src/core/engine.ts — `setStatus` lib facade
- src/core/handlers.ts — setStatus handler (lock, identity, events)
- src/core/status.test.ts — NEW: seam integration (frontmatter semantics, envelopes, events)
- src/renderer/src/stores/handoffs.ts — `setStatus` action, decline/snooze modal state, transition toasts, consume-from-accepted
- src/renderer/src/views/handoffs/Board.tsx — `LifecycleActions` row per state
- src/renderer/src/views/handoffs/DeclineReasonModal.tsx — NEW
- src/renderer/src/views/handoffs/SnoozeUntilPicker.tsx — NEW
- src/renderer/src/views/handoffs/lifecycle.ts — NEW: pure snooze dates + attribution lines
- src/renderer/src/views/handoffs/lifecycle.test.ts — NEW: gating matrix, date boundaries, toast vocabulary
- src/renderer/src/components/HandoffCardView.tsx — actionsSlot, expired marker, snooze foot
- src/renderer/src/components/Modal.tsx — `destructive` confirm variant
- src/renderer/src/views/reader/NoteView.tsx — attribution history lines
- src/renderer/src/App.tsx — mount the two new modals
- src/renderer/src/styles.css — `.snooze-expired`, `.snooze-quick`, `.handoff-history`

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC1/2: state-legal action rows per `lifecycle.test.ts`; DeclineReasonModal (reason-gated rust confirm) and SnoozeUntilPicker (min tomorrow) wired app-root.
- AC3: stamp chips render every v2 state — OPEN gold / ACCEPTED navy / DECLINED rust / CONSUMED text-2 / SNOOZED dashed — verified in StatusChip + design-fidelity assertions; stamp-press respects reduced-motion.
- AC4: expired snooze is DERIVED (poller/notify tests); reopen is the only writer.
- AC5: E2E drive stage 3: accept receipt `before: open → after: accepted` + `handoff.stateChanged` event; illegal reopen-from-accepted refused with a typed envelope.
