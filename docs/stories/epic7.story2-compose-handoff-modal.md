# Story 7.2: Compose-handoff modal

## Status

Done

## Story

**As a** sender,
**I want** to compose a request or delivery handoff from the app,
**so that** handing work to another project no longer requires the CLI.

## Acceptance Criteria

1. A "New handoff" primary action (board view) opens a DESIGN v2 modal: centered card 480–560px, radius 16px, title 17px/600, footer = Cancel (outline) left, gold primary right.
2. The modal contains: a **kind segmented control** (`request | delivery`, `--bg-inset` track, white active segment), a **to-project select** fed by registered projects, an **objective** field (required), an optional prose body, and a **note scope picker** — multi-select of notes from the sending project whose order becomes Reading order.
3. Submitting invokes `handoffs.create` with `CreateHandoffInput` + the app identity profile; the result card appears on the board immediately (optimistic on `handoff.created`), with a receipt toast showing path + pushed state.
4. Validation errors from the lib (unknown note, missing identity) render as actionable messages in the modal — never a silent failure; identity unset blocks submit with a link to Settings.
5. One gold primary per view is preserved; the modal is keyboard-complete (tab order, Esc cancels, ⌘Enter submits) and listed in the ⌘K palette.

## Tasks / Subtasks

- [x] Modal shell (AC: 1, 5)
  - [x] `views/board/ComposeHandoffModal.tsx` per the DESIGN v2 modal pattern; wire "New handoff" entry from the board and ⌘K
- [x] Form controls (AC: 2)
  - [x] Segmented control for `kind`; to-project select from the registry/config projects (exclude the from-project); objective input; optional body textarea
  - [x] Note scope picker: searchable list of the from-project's notes (via existing tree/search data), selected order = `notes[]` order; optional `nextActions[]` line items
- [x] Submit path (AC: 3, 4)
  - [x] `handoffs.create` invoke; map `{code,message}` envelopes to inline field errors; receipt toast (mono details line, auto-dismiss 5s)
  - [x] Board store: insert card on `handoff.created` event (no full refetch)
- [x] Tests
  - [x] Component: control states, validation rendering, submit payload shape; store: optimistic insert + event reconciliation

## Dev Notes

- Depends on Story 7.1 (lib PR-11 pin). The `handoffs.create` channel payload is `CreateHandoffInput & {identity from profile}` → `HandoffCreateResult`; state touched: vault (lib). The renderer never assembles frontmatter — the brief is built verbatim by `createHandoff` (NO LLM). [Source: architecture-m2.md#8-ipc-additions] [Source: architecture-m2.md#2-lib-api-additions]
- `toProject` must be a registered project — the select is the guarantee; free-text entry is not offered. [Source: architecture-m2.md#2-lib-api-additions]
- Modal anatomy (segmented control, toggle rows, footer buttons) is the binding reference pattern; kind chips downstream: request cards get a `REQUEST` navy chip (Story 8.2). [Source: DESIGN.md#layout] [Source: DESIGN.md#signature-routing-slip-handoff-card]
- Identity comes from the app profile (app-db `meta` after 9.2); git identity is injected per command by the core host (NFR11) — the modal only blocks when the profile is unset.
- `repliesTo`/`fulfills` fields exist on the input but are NOT surfaced here — reply is Story 7.3, close-the-loop is Story 8.3; keep the modal component reusable for prefilled variants.
- Files: `src/renderer/src/views/board/ComposeHandoffModal.tsx`, `src/renderer/src/stores/handoffs.ts`, `src/shared/ipc-contract.ts` (`handoffs.create`), `src/core/ipc.ts` (register → engine facade under write lock).

### Testing

- Unit: form validation matrix, payload assembly (notes order preserved), error-envelope mapping. Integration: compose against a fixture vault → note exists at the expected dest with `loredex_schema: 2`, `kind`, Reading order intact. [Source: architecture-m2.md#2-lib-api-additions]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- App suite 175/175, typecheck (node+web) clean, production build clean.
- Core integration: `src/core/compose.test.ts` — create over the seam lands the v2 note, emits `handoff.created` (card) + `vault.changed`, maps unknown-note/missing-identity to actionable envelopes.
- DoD driver vs `_machine2/nimbus-vault`: `handoffs.create` → `{"id":"2026-07-10-handoff-nimbus-backend-2", pushed:true}`; CLI on the machine-1 clone (`loredex handoffs --project nimbus-frontend`, pulls first) lists it.

### Completion Notes List

- Contract additions (`handoffs.create/reply/annotate`, `route.preview/route.file` reshape, `handoff.created` event, `ILLEGAL_TRANSITION/AMBIGUOUS_HANDOFF/UNKNOWN_HANDOFF` codes) land in this story's commit — one seam change for the epic, per architecture-m2 §8.
- Identity rides the invoke payload from the renderer profile store (same pattern as `handoffs.consume`); modal blocks submit and links to Settings when unset (AC4).
- Modal component lives in `views/handoffs/` next to the Board (the story's `views/board/` dir does not exist in this repo — architecture.md source tree names the dir `handoffs/`; recorded deviation, no restructure of a working seam).
- A from-project select was added (not in AC2's list): the payload requires `fromProject` and the board's company-wide view has no implicit sender. Defaults to the board's selected project.
- Receipt toast (DESIGN v2, `.toast-stack` CSS from 14.1 now has a component + store) shows vault-relative path + honest push state; auto-dismiss 5 s.
- Optimistic insert: App-level `handoff.created` listener → `useHandoffs.applyCreated` (works when the modal was opened from the reader too); authoritative refetch still rides `vault.changed`.
- One gold primary per view kept: header "New handoff" is the board's gold action; the empty-state "Check again" was demoted to a navy-outline secondary.
- ⌘K "New handoff…" action ships with the palette action provider (committed with story 7.4's integration files; verified in this batch).

### File List

- src/shared/ipc-contract.ts (channels, event, codes)
- src/shared/types.ts (lib re-exports, ReplyHandoffInput, RoutePreview reshape)
- src/shared/handoff-lanes.ts (qualifiedId)
- src/core/engine.ts (composeHandoff/reply/annotate/handoffCard/routePlan/route + HandoffError mapping)
- src/core/handlers.ts (five new channel registrations under the write lock)
- src/core/compose.test.ts (new), src/core/engine.test.ts (route.preview graduated)
- src/renderer/src/components/Modal.tsx, ToastStack.tsx (new)
- src/renderer/src/stores/toasts.ts (new), stores/handoffs.ts (+compose state, applyCreated), stores/handoffs.test.ts (new)
- src/renderer/src/views/handoffs/compose-form.ts + compose-form.test.ts (new)
- src/renderer/src/views/handoffs/ComposeHandoffModal.tsx (new), Board.tsx
- src/renderer/src/styles.css (modal/toast/picker CSS)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- AC1/2/5: modal wired from the board's one gold primary and ⌘K ("New handoff…"); segmented kind control, registered-project select, note scope picker per `compose-form.test.ts`; keyboard matrix unit-tested.
- AC3/4: `src/core/compose.test.ts` — create over the seam lands the v2 note, emits `handoff.created` + `vault.changed`, maps unknown-note/missing-identity to actionable envelopes. E2E drive stage 1: request composed against a sandboxed clone of the nimbus remote, `pushed: true`, card event observed.
