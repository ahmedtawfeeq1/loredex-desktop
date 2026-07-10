# Story 10.3 (SUPERSEDED): Blocked-on list view (PM screen)

## Status

Superseded — replaced by the Vault Atlas (docs/plan/ATLAS-CONCEPT.md §5). The blocked-on question is answered by the blocked filter preset + oldest-first side list in epic10.story6-path-tracing-filters-search.md (ATLAS-6). Do not implement.

## Story

**As a** PM,
**I want** a flat, oldest-first list of open requests showing who blocks whom,
**so that** the standup question "what's stuck and on whom" answers itself.

## Acceptance Criteria

1. A Blocked-on view lists every open/accepted `kind: request` (expired snoozes included) from `graph.model`'s blocking edges, **older-first**, dense list rows (38px) — each row: age (mono, prominent), `from ⟶ to` mono route line, objective, stamp chip.
2. Rows group under day/age headers (11px caps `--text-2`); each row states the blocking relation plainly: "<to-project> is blocked on <from-project>" derived from the edge direction.
3. Clicking a row opens the handoff detail (thread rail included); a secondary action deep-links to the Graph view with that node focused.
4. Requests that gained a FULFILLED badge (Story 8.3) or left open/accepted state drop off live on `handoff.*` events; the empty state is one serif sentence ("Nothing is blocked.").
5. The view is listed in the sidebar + ⌘K; keyboard navigation and both themes per the quality floor.

## Tasks / Subtasks

- [ ] List view (AC: 1, 2)
  - [ ] `views/graph/BlockedOnView.tsx`: consume `graph.model` blocking edges; sort ascending by created date; dense rows + age headers per DESIGN list rules
- [ ] Navigation (AC: 3, 5)
  - [ ] Row → handoff detail; secondary → GraphView focus param; sidebar/⌘K entries
- [ ] Live updates + empty state (AC: 4)
- [ ] Tests

## Dev Notes

- Same derived model as the graph (Story 10.1) — this is a projection, not a second computation; if the two views disagree, that's a 10.1 bug. [Source: architecture-m2.md#8-ipc-additions]
- Blocking = open/accepted request; expired snooze counts as open (derived-flag rule, consistent everywhere). Older-first is the point of the screen — age is the sort key AND the visual lead. [Source: architecture-m2.md#1-handoff-schema-v2]
- Dense where data lives: 38px rows, day headers 11px caps — this is a list, not cards. No gold except stamp chips; the view has no primary action. [Source: DESIGN.md#layout] [Source: DESIGN.md#tokens]
- Depends on Stories 10.1 (model) and 8.2 (detail/thread rendering the rows open into). Files: `src/renderer/src/views/graph/BlockedOnView.tsx`, sidebar nav, ⌘K registration.

### Testing

- Unit: sort/grouping from fixture models, blocking-sentence derivation, live-drop on state change, empty state. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |
| 2026-07-10 | 1.1 | Superseded by Vault Atlas ATLAS-6 (epic10.story6-path-tracing-filters-search.md, per docs/plan/ATLAS-CONCEPT.md) | Bob (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
