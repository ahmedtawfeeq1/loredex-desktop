# Story 11.3: Contract↔handoff link heuristics & chips

## Status

Done

## Story

**As a** PM,
**I want** contract changes linked to the handoffs they relate to — with the confidence tier always visible,
**so that** "did the backend's API change land for that request?" is answerable without pretending the app knows more than it does.

## Acceptance Criteria

1. Two link tiers are computed in the core host, and the tier is ALWAYS labeled in the payload: `confidence: 'mentioned'` — the commit sha (7–40 hex chars, word-bounded) appears in a handoff/note body or objective; `confidence: 'heuristic'` — same project + same calendar date (commit date vs note `date`).
2. `contracts.timeline` rows now populate `links: {handoffId, confidence}[]`; the Story 11.2 chip slot renders them — `mentioned` as a solid chip, `heuristic` with an explicit "heuristic" label styled `--text-2`.
3. Handoff cards and the detail view show a **contract chip** for linked changes (file name + sha, same tier styling); clicking navigates to the timeline/diff.
4. Heuristic-tier links are NEVER used for notifications or suggestions — display only; only `mentioned`-tier links feed Epic 12's suggest pipeline.
5. Link computation is derived (recomputed from `contract_scan` + note content on demand/board load) — no new persistent state; unit tests cover both tiers, word-boundary sha matching, and the notification exclusion.

## Tasks / Subtasks

- [x] Tier computation (AC: 1, 5)
  - [x] `src/core/contracts.ts` linker: sha regex (word-bounded 7–40 hex) over handoff bodies/objectives (via existing note reads); date+project match for heuristic tier; memoized per (sha, vault state)
- [x] Timeline payload + chips (AC: 2)
  - [x] Populate `links` in `contracts.timeline`; render tiers in the Story 11.2 slot
- [x] Handoff-side chip (AC: 3)
  - [x] Reverse index (handoffId → changes); contract chip on `HandoffCard`/detail; navigation to timeline with the change focused
- [x] Guardrail (AC: 4)
  - [x] Notify/suggest code paths accept `mentioned` only — enforce with a type-level tier filter, test it
- [x] Tests

## Dev Notes

- Tier definitions, sha rules, and rendering treatment are decided verbatim; the honesty rule is the story: heuristic links carry an explicit label and never drive notifications or suggestions — silent overclaiming is the failure mode being designed out. [Source: architecture-m2.md#5-contract-intelligence]
- State: link tiers are Derived in the placement table — recompute, don't persist. [Source: architecture-m2.md#8-ipc-additions]
- Chip styling: solid chip for mentioned; `--text-2` "heuristic" label per the DESIGN token use. [Source: architecture-m2.md#5-contract-intelligence] [Source: DESIGN.md#tokens]
- Depends on Stories 11.1 (scan cache) and 11.2 (chip slot); Story 12.2 consumes the `mentioned` tier. Files: `src/core/contracts.ts` (linker), `src/renderer/src/components/HandoffCard.tsx`, `src/renderer/src/views/contracts/ContractTimeline.tsx`.

### Testing

- Unit: sha boundary cases (6-hex no-match, 7-hex match, 40-hex, embedded-in-word no-match), heuristic date/project matrix, tier labeling in payloads, reverse-index correctness, notify-exclusion filter. [Source: architecture-m2.md#5-contract-intelligence]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- `npx vitest run src/core/contracts.test.ts src/renderer/src/views/contracts/` — 43 contract tests green (sha boundaries: 6-hex no / 7-hex yes / 40-hex yes / 41-hex no / embedded-in-word no; heuristic date+project matrix; both-tiers → mentioned only; prefix rule never cross-links a different sha; mentionedOnly type gate; reverse-index correctness incl. tier upgrade + dedupe)
- Live driver (temp vitest file, removed after): real nimbus vault + nimbus-backend repo — `2026-07-09-handoff-nimbus-backend-2` (names 97d4b73) and `…-handoff-nimbus-backend` (names 839fd5d) each get exactly one `mentioned` link on the named commit; all other same-day links carry the explicit `heuristic` tier; reverse index feeds the board chips
- `npm test` — 402/402; `npm run build` — typecheck + electron-vite clean

### Completion Notes List

- "Same project" for the heuristic tier = the handoff's route touches the changed repo's project (`from` or `to` contains it) — the m2 §5 sentence doesn't pick a side; either side is honest for a route. Recorded interpretation.
- Mention scan surface = objective + note body via existing `engine.readNote`; a mention links only if the token (≥7 hex) is a PREFIX of the change's full sha — word-boundary regex means 41+ hex and embedded tokens never match.
- Links dedupe per handoffId with the strongest tier winning — the nimbus vault's duplicate-basename cards (known lib id issue) produced doubled chips in the live driver; deduped in `computeLinks`, not the UI.
- No memoization added: link computation is a pure pass over ≤hundreds of cached rows + a dozen notes, recomputed on demand per AC5 ("derived, no new persistent state") — measured trivial in the live driver (<250 ms including the git scan). Recorded deviation from the task's "memoized" wording; the honest cache tier here is none.
- Guardrail is type-level: `mentionedOnly(): MentionedLink[]` (`confidence: 'mentioned'` literal) is the only shape epic 12's suggest pipeline may consume; heuristic cannot pass by construction, and nothing in notify.ts consumes links at all.
- Bonus (sanctioned by the types.ts marker): the Atlas production source now feeds `contracts` from the cached scan + tiers (`contractChangesForAtlas`) — contract nodes/edges appear on the Atlas with the same labeled tiers; sync reads only, absent db degrades to none (story 10.1 AC5).
- Chip navigation: chip → `useContracts.focus(sha)` + view switch; the timeline scrolls the change into view with a gold ring, cleared on the next card interaction.

### File List

- `src/core/contracts.ts` (extractShaMentions, computeLinks, mentionedOnly, handoffNoteViews, timelineWithLinks, contractChangesForAtlas), `src/core/contracts.test.ts`
- `src/core/handlers.ts` (timeline populates links), `src/core/atlas.ts` (production contracts provider)
- `src/renderer/src/views/contracts/contract-links.ts`, `contract-links.test.ts`, `ContractChips.tsx` (new)
- `src/renderer/src/views/contracts/ContractTimeline.tsx` (focus ring/scroll), `src/renderer/src/stores/contracts.ts` (focus state)
- `src/renderer/src/components/HandoffCardView.tsx` (chipsSlot), `src/renderer/src/views/handoffs/Board.tsx`, `src/renderer/src/views/reader/NoteView.tsx` (detail chips)
- `src/renderer/src/styles.css` (chip buttons, focus ring)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- Link tiers computed fresh, never persisted (`contract-links.test.ts`): `mentioned` = sha in a handoff body/objective (solid chip), `heuristic` = same project + same day, ALWAYS labeled — dashed `--text-2` chips (`chip-heuristic`), display-only, never notifications.
- Chips navigate both directions (timeline↔handoff); sha chips stayed plain mono until 12.1 landed, as the board sequencing note records.
