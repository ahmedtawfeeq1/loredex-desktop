# Story 11.3: Contract↔handoff link heuristics & chips

## Status

Approved

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

- [ ] Tier computation (AC: 1, 5)
  - [ ] `src/core/contracts.ts` linker: sha regex (word-bounded 7–40 hex) over handoff bodies/objectives (via existing note reads); date+project match for heuristic tier; memoized per (sha, vault state)
- [ ] Timeline payload + chips (AC: 2)
  - [ ] Populate `links` in `contracts.timeline`; render tiers in the Story 11.2 slot
- [ ] Handoff-side chip (AC: 3)
  - [ ] Reverse index (handoffId → changes); contract chip on `HandoffCard`/detail; navigation to timeline with the change focused
- [ ] Guardrail (AC: 4)
  - [ ] Notify/suggest code paths accept `mentioned` only — enforce with a type-level tier filter, test it
- [ ] Tests

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

### Debug Log References

### Completion Notes List

### File List

## QA Results
