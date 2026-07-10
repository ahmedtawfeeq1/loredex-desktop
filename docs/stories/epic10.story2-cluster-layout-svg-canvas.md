# Story 10.2: Cluster layout + SVG canvas (Overview) — ATLAS-2

## Status

Approved

## Story

**As a** PM opening the Atlas,
**I want** an Overview canvas of project cluster cards with aggregated handoff-flow edges,
**so that** who-owes-whom across the whole vault is one glance before I drill anywhere.

## Acceptance Criteria

1. An Atlas view renders `atlas.graph` (level `overview`) as **hand-rolled SVG — no chart lib**: project cluster cards are mini routing-slip cards (white card, 1px hairline, radius 12px, project name navy 600, open-count gold badge); edges 1.5px `--hairline` with navy arrowheads.
2. Layout comes from the model's precomputed positions (left→right by route-dependency depth, computed core-side in story 10.1) — the renderer positions and styles, it computes nothing; the view uses the full pane width and pans/zooms when it overflows.
3. Aggregated route edges between collapsed project clusters render with `N open / M total` counts, open counts gold-badged; no note-level nodes appear at this level.
4. Empty state (no projects / no edges) is one serif sentence + one action; a loading state covers the first `atlas.graph` fetch; the view live-refreshes when the core invalidates the graph (`vault.changed` / handoff events).
5. Quality floor: both themes token-only; nodes keyboard-traversable (arrow keys) with `:focus-visible` 2px gold ring; hover = gold ring; reduced-motion disables transitions; sidebar nav entry + ⌘K entry ("Vault Atlas") registered.

## Tasks / Subtasks

- [ ] Canvas + cluster cards (AC: 1, 2)
  - [ ] `views/atlas/AtlasView.tsx` + `AtlasCanvas.tsx`: SVG root, pan/zoom container, cluster card component from model positions
- [ ] Aggregated edges (AC: 3)
  - [ ] Edge paths with arrowhead markers; `N open / M total` count badges on collapsed-cluster routes
- [ ] States + wiring (AC: 4, 5)
  - [ ] Loading/empty states, live-refresh subscription, sidebar/⌘K registration, keyboard traversal, both themes, reduced-motion
- [ ] Tests
  - [ ] Layout snapshot per fixture graph; aggregation badge content; a11y focus order

## Dev Notes

- This is the ATLAS-2 slice verbatim: deterministic left→right depth layout computed core-side; project cluster cards with open-count badges; aggregated route edges with counts; pan/zoom; empty/loading states per DESIGN. Overview never renders note-level nodes — that is the scaling trick (collapsed cluster atoms + aggregated inter-cluster edges), and it keeps Stage-2 cost to one project at a time when story 10.3 adds drilling. [Source: plan/ATLAS-CONCEPT.md#story-slices-realistic-sequential-where-marked] [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas]
- No React Flow / ELK / d3 — DESIGN.md is binding: SVG, no chart lib, nodes are mini routing-slip cards, edges 1.5px hairline with navy arrowheads, layout left→right by dependency depth, hover gold ring. The renderer stays logic-light; positions arrive precomputed from `atlas.graph`. [Source: plan/ATLAS-CONCEPT.md#4-what-we-deliberately-do-not-adopt] [Source: DESIGN.md#data-visualizations-dependency-graph-contract-timeline]
- Gold budget: open-count badges and (later) the tour Start button are this view's gold — no gold primary button on the canvas; the empty-state action may be the one primary. Wide views use the space — no max-width straitjacket. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack] [Source: DESIGN.md#dont]
- Renderer store is a thin slice (selection, expanded clusters, filters — grown by later stories); no layout caches, no cache-invalidation gymnastics — our layout is deterministic and precomputed. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack]
- Depends on story 10.1 (`atlas.graph`). Cluster click behavior (drill) lands in 10.3 — here a click may select only. Files: `src/renderer/src/views/atlas/AtlasView.tsx`, `AtlasCanvas.tsx`, sidebar nav, ⌘K entry.

### Testing

- Unit: cluster card render from fixture model (name, badge, position), aggregated edge counts, empty/loading states, keyboard traversal order; visual sanity in both themes against the fixture vault. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from ATLAS-CONCEPT.md §5 (ATLAS-2); supersedes epic10.story2-svg-graph-view | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
