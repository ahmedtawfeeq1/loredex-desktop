# Story 10.2 (SUPERSEDED): SVG dependency graph view

## Status

Superseded — replaced by the Vault Atlas (docs/plan/ATLAS-CONCEPT.md §5). The Overview canvas (project cluster cards, aggregated route edges, SVG no-chart-lib) lands in epic10.story2-cluster-layout-svg-canvas.md (ATLAS-2). Do not implement.

## Story

**As a** PM,
**I want** a visual dependency graph of projects and open handoffs,
**so that** who-waits-on-whom is one glance, not a board archaeology session.

## Acceptance Criteria

1. A Graph view renders `graph.model` as **hand-rolled SVG — no chart lib**: nodes are mini routing-slip cards (project name navy 600 + open-count gold badge); edges 1.5px `--hairline` with navy arrowheads.
2. Layout is left→right by the model's dependency depth (column per depth, deterministic vertical order); the view uses the full pane width (no dead whitespace) and pans/scrolls when it overflows.
3. **Blocked-critical-path edges render gold**; hover = gold ring on the node; click = side panel listing that project's open handoffs (cards link into the board/detail).
4. Both themes render correctly from tokens; nodes and the side panel are keyboard-reachable (`:focus-visible` gold ring, arrow-key node traversal); reduced-motion disables any transition.
5. The view live-updates on `handoff.*` events; the empty state is one serif sentence + one action ("Compose a handoff").

## Tasks / Subtasks

- [ ] SVG renderer (AC: 1, 2)
  - [ ] `views/graph/GraphView.tsx`: column layout from `depth`, mini-card nodes (foreignObject or pure SVG text per perf), edge paths with arrowhead markers; pan/scroll container
- [ ] Critical path + interaction (AC: 3)
  - [ ] Gold stroke for `criticalPath` edges; hover ring; click → `GraphSidePanel.tsx` (open handoffs for the node, board links)
- [ ] Quality floor (AC: 4, 5)
  - [ ] Token-only colors (light/dark), focus traversal, reduced-motion, live refresh subscription, empty state
- [ ] Tests
  - [ ] Layout snapshot per fixture model; interaction unit tests (hover/click/keyboard)

## Dev Notes

- The visualization spec is binding and complete: SVG, no chart lib; nodes = mini routing-slip cards; edges 1.5px hairline, arrowheads navy; blocked-critical-path edges gold; left→right by dependency depth; hover gold ring; click detail panel. Implement it, don't substitute a library. [Source: DESIGN.md#data-visualizations-dependency-graph-contract-timeline]
- All graph math (depth, blocking, critical path) comes from Story 10.1's `graph.model` — the renderer positions and styles, nothing more. [Source: architecture-m2.md#8-ipc-additions]
- Gold budget: the critical path + open-count badges ARE this view's gold; no gold primary button here — the empty-state action can be the view's one primary. [Source: DESIGN.md#tokens]
- Wide views use the space (board columns, graph) — no max-width straitjacket. [Source: DESIGN.md#dont]
- Depends on Story 10.1. Files: `src/renderer/src/views/graph/GraphView.tsx`, `GraphSidePanel.tsx`, sidebar nav entry, ⌘K entry.

### Testing

- Unit: column assignment render, gold-edge selection, side-panel content from a fixture model; axe-style a11y pass on focus order. Visual sanity in both themes against the fixture vault. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |
| 2026-07-10 | 1.1 | Superseded by Vault Atlas ATLAS-2 (epic10.story2-cluster-layout-svg-canvas.md, per docs/plan/ATLAS-CONCEPT.md) | Bob (SM) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
