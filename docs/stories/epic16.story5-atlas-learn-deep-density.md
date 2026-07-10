# Story 16.5: Atlas Learn/Deep density — the drilled panel fills with content

## Status

Done

## Story

**As a** vault explorer drilling into a project on the Atlas,
**I want** the focused panel to lay its notes out at full card size across the panel's width and height,
**so that** the drilled Learn/Deep view is readable and dense (DESIGN.md v2 + Addendum D1 sensibility), not a tiny strip of ~100px cards above an empty panel.

## Defect (screenshot-verified)

Drilled Learn renders the focused panel's content TINY in a top strip: mini note cards ~100px wide with ~8px type, side pills cramped against the panel, edge count labels crowding the pill channel, and the panel's lower ~80% empty. Root causes found in code:

1. **Core layout**: `positionPanel` gave every topic ONE unbounded column — nimbus-backend's `handoffs(13)` made a 1264×1900 bbox; `fitViewBox` (pane-aspect fit) then zooms to ~38%, shrinking every 200×84 card to ~76px with ~5px effective type.
2. **Renderer panel rect**: the focused panel was sized from ALL cluster members including atom-HIDDEN ones (story 10.3 lazy expand), so with topics collapsed the visible atoms sat in the top strip of a panel sized for 18 invisible cards.
3. **Pill channel**: `panelX = MARGIN + PILL_W + GUTTER` left the pill→panel chip channel exactly chip-tight (112px chip in a 184px gap ⇒ 12px from the panel card edge at full zoom, nothing at 38%).

## Acceptance Criteria

1. Inside the focused panel, content lays out to FILL the panel: topic columns distribute across the full panel width, wrapping into rows on the GRID pitch; note cards stay full mini-routing-slip size (200×84, shared/atlas-layout.ts) with their 12–13px type readable at the fitted zoom.
2. Panel height derives from content (the canvas pans/zooms) — never a fixed strip; the renderer panel is sized by what is VISIBLE (expanded cards + collapsed atoms), never by hidden members.
3. Side pills get their own gutter column with the same clearance guarantees as Overview: aggregated `N open / M total` label chips never clip under a pill or the panel card (chip-clearance invariant reused, with margin).
4. Handoffs keep their own lane(s); deep-level source/commit/contract context columns keep theirs — wrapped lanes never interleave with topic columns.
5. Layout invariant tests for the drilled level: minimum card size (nothing below 200×84), no label/pill intersection (8px clearance), and panel-content fill ratio > 0.5 whenever the panel holds more than 6 members — asserted on the fixture AND on the real nimbus vault drilled into nimbus-backend (18 notes, the user's exact case), plus a readability bound (fitted card ≥ 140px on a 1280×800 pane at drilled Learn).
6. Determinism preserved: no randomness, ties broken date → label → id exactly as before; positions still computed core-side only.

## Tasks / Subtasks

- [x] Shared layout contract (AC: 1, 3)
  - [x] `PANEL_ASPECT` (target w/h the panel wraps toward) + `panelWrapRows(count)` in shared/atlas-layout.ts
  - [x] `PILL_GUTTER` (GRID-aligned 216px): pill column → panel gutter that fits a CHIP_W chip with real clearance both sides
  - [x] Move `panelRect` into shared/atlas-layout.ts (renderer re-exports; core tests can assert against the panel card)
- [x] Core panel layout (AC: 1, 4, 6)
  - [x] `panelColumns` → `panelBlocks` (topic blocks; `handoffs` + deep extras flagged own-lane)
  - [x] `positionPanel` flow-packs blocks into columns of `panelWrapRows(total)` rows; own-lane blocks always start (and end) a fresh column
  - [x] `panelX` uses `PILL_GUTTER` when side pills exist
- [x] Renderer visibility-derived panel (AC: 2)
  - [x] `visiblePanels(clusters, visibleNodes, atoms, level)` pure helper in atlas-visibility.ts — panel bounds VISIBLE members + atoms + header (+ visible deep extras)
  - [x] Atom anchor = first member in flow order (x, then y) — an occupied cell, never a free-floating min-corner
  - [x] AtlasCanvas uses `visiblePanels`; topic labels only for topics with visible members, anchored at the flow-first member
- [x] Invariant tests (AC: 5)
  - [x] `assertDrilledInvariants`: min card size, chip-vs-pill 8px clearance, per-panel fill ratio > 0.5 when > 6 members
  - [x] Fixture drilled learn/deep + nimbus drilled nimbus-backend learn/deep (18-member case) + fitted-card readability at learn
  - [x] `panelWrapRows` unit tests (geometry test file); `visiblePanels` unit tests (visibility test file)

## Dev Notes

- Binding: DESIGN.md v2 "wide views use the space" + Addendum D1 density sensibility; layout-v2 lane spec in shared/atlas-layout.ts header updated for wrapped lanes. [Source: DESIGN.md, DESIGN.md#addendum-d1]
- Positions stay core-side (`projectAtlas`) — the renderer computes NO layout, only which rects are visible (story 10.2/10.3 contract intact). [Source: docs/stories/epic10.story2-cluster-layout-svg-canvas.md]
- Wrap math: `rows = ceil(sqrt(members × TOPIC_COL_PITCH / (NOTE_ROW_PITCH × PANEL_ASPECT)))` — the panel's grid tends toward PANEL_ASPECT (1.6) so `fitViewBox` (which fits the pane aspect, never above 1:1) lands near natural size. For the user's 18-member case this yields 4 columns × 5 rows (fill 0.9) instead of a 13-row strip.
- Own-lane rule keeps D1's "handoffs in their own lane": a handoffs (or deep extras) block starts a fresh column and the next block starts fresh after it — wrapped handoff lanes stay contiguous, never interleaved with topic notes.
- Lazy expand (story 10.3 atoms) is kept; the fix makes the panel honest about it: hidden members no longer inflate the panel or the fit. Expanding a topic re-fits (fitKey already counts visible nodes/atoms).
- The chip-clearance invariant is the story 10.1/10.2 layout-v2 one (`chipRect` × `rectsOverlap`); the drilled test re-uses it with an 8px inflation on pill rects ("labels never clipped" with margin, not just non-overlap).
- No CSS changes: card type was already 12–13px at 1:1 (atlas-note-title 12.5px serif) — the tiny type was pure fit-zoom fallout, fixed by layout aspect.
- Files: shared/atlas-layout.ts, core/atlas.ts (+ atlas.test.ts), renderer views/atlas/{atlas-geometry.ts, atlas-visibility.ts (+ test), AtlasCanvas.tsx}, atlas-geometry.test.ts.

### Testing

- Core (colocated vitest): drilled invariants on fixture + real nimbus vault (skipIf-guarded like the existing contract suite): min card size, 8px chip/pill clearance, fill ratio > 0.5 (> 6 members), learn readability bound (fitted card ≥ 140px @ 1280×800), plus all pre-existing layout-v2 invariants unchanged.
- Renderer: `visiblePanels` bounds atoms not hidden members (the top-strip regression pin); atom anchor is an occupied flow cell; `panelWrapRows` monotone + aspect-bounded.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from the screenshot-verified Learn/Deep density defect (M4 polish cycle) | Dev agent (BMAD) |
| 2026-07-10 | 1.0 | Implemented; invariants proven on the real nimbus vault drilled into nimbus-backend | Dev agent (BMAD) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Defect reproduced numerically first (scratch vitest against the LIVE nimbus vault, removed before commit): learn drilled nimbus-backend bbox was **1264×1900** (handoffs topic = one 13-row column) → a 1280×800 fit forces scale ≈ 2.6 → 200px cards render ~76px with ~5px effective type; deep bbox 2264×1900. Post-fix: learn **1320×748** (4×5 grid, scale ≈ 1.11 → ~180px cards), deep 2264×892.
- Sequential gate: `npm run typecheck` clean (node+web) → `npm test` 80 files / **676 tests** green (+11 new: 5 core drilled invariants, 3 wrap-rows geometry, 3 visibility/panel) → `npm run build` clean → `npm run test:e2e` **18/18** (~27 s).
- Nimbus contract suite (existing skipIf block) runs the new drilled invariants against the real vault: 18 panel members at learn, fill 0.9, chips ≥ 8px clear of every pill, fitted card ≥ 140px.

### Completion Notes List

- **Root causes (all three fixed):** (1) core `positionPanel` gave each topic one unbounded column; (2) the renderer sized the focused panel from ALL members including atom-hidden ones, so the default drilled view was a tiny strip over a panel sized for 18 invisible cards; (3) `GUTTER` left the pill→panel chip channel exactly chip-tight.
- **Wrap-rows selection is fragmentation-aware:** `panelWrapRows(runs)` scans every candidate row count over the panel's flow runs (consecutive topic blocks = one run; handoffs + each deep context type = own-lane runs), keeps the grid closest to `PANEL_ASPECT` (1.6) and rejects grids with fill ≤ 0.55 when > 6 members. A naive `ceil(sqrt(...))` failed the fill invariant on nimbus-frontend deep (lane singletons fragmented the grid to exactly 0.5).
- **Own-lane rule preserved:** handoffs (and deep source/commit/contract lanes) always start a fresh column and the next block starts fresh after them — wrapped handoff lanes stay contiguous, never interleaved with topic notes (D1 "handoffs in their own lane").
- **Panel honesty about lazy expand (10.3 atoms kept):** new pure `visiblePanels` bounds the panel by visible cards + atoms + header; expanding a topic grows the panel and refits (fitKey already counts visible nodes/atoms). Atom anchor moved from independent min-x/min-y (which can be a free corner under another topic's card once topics wrap) to the flow-first member's occupied cell.
- **Pill gutter:** `PILL_GUTTER` = 216 (GRID×9) puts the aggregated-route chip mid-channel with ≥ 34px to the panel card and ≥ 58px to the pill; the drilled invariant asserts chips clear every pill/header inflated by 8px ("never clipped", not merely non-overlapping).
- `panelRect` moved to shared/atlas-layout.ts (renderer re-exports it, same import surface) so both seam sides and the tests share the panel-card geometry.
- No CSS changes: card type was already 12–13px at 1:1 (atlas-note-title 12.5px serif) — the tiny type was pure fit-zoom fallout; determinism, node/edge taxonomy, resolution, tours, filters untouched.
- Deviation: none against D1/DESIGN v2. Note: deep drilled on nimbus still fits at ~107px cards in a 1280×800 pane (readability bound asserted at learn, the defect's level; deep is inherently the everything view and pans/zooms).

### File List

- src/shared/atlas-layout.ts — `PANEL_ASPECT`, `PILL_GUTTER`, `panelWrapRows(runs)`, `panelRect` (moved from renderer); lane-spec header updated
- src/core/atlas.ts — `panelBlocks` (own-lane flags), flow-packing `positionPanel`, `PILL_GUTTER` panel offset
- src/core/atlas.test.ts — `assertDrilledInvariants` (min card size, 8px chip/pill clearance, fill > 0.5), `panelFill`, `fitScaleFor`; fixture wrap test + nimbus 18-member/readability tests
- src/renderer/src/views/atlas/atlas-geometry.ts — `panelRect` re-exported from shared (local copy removed)
- src/renderer/src/views/atlas/atlas-geometry.test.ts — `panelWrapRows` unit tests (aspect, anti-fragmentation, determinism)
- src/renderer/src/views/atlas/atlas-visibility.ts — flow-first atom anchor; NEW `visiblePanels`
- src/renderer/src/views/atlas/atlas-visibility.test.ts — atom-anchor + visible-panel tests (hidden members never inflate)
- src/renderer/src/views/atlas/AtlasCanvas.tsx — panels via `visiblePanels`; topic labels only for visible members, flow-first anchored
- docs/stories/epic16.story5-atlas-learn-deep-density.md — this story
- docs/stories/sprint-status.yaml — epic-16 row (16-5)
