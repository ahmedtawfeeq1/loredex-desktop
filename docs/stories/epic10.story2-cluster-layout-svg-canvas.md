# Story 10.2: Cluster layout + SVG canvas (Overview) — ATLAS-2

## Status

Done

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

- [x] Canvas + cluster cards (AC: 1, 2)
  - [x] `views/atlas/AtlasView.tsx` + `AtlasCanvas.tsx`: SVG root, pan/zoom container, cluster card component from model positions
- [x] Aggregated edges (AC: 3)
  - [x] Edge paths with arrowhead markers; `N open / M total` count badges on collapsed-cluster routes
- [x] States + wiring (AC: 4, 5)
  - [x] Loading/empty states, live-refresh subscription, sidebar/⌘K registration, keyboard traversal, both themes, reduced-motion
- [x] Tests
  - [x] Layout snapshot per fixture graph; aggregation badge content; a11y focus order

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
| 2026-07-10 | 1.1 | layout-v2 defect burndown: lane/panel layout, orthogonal edge channels, chip clearance, no-overlap/no-orphan invariants, fit-to-content viewport, designed canvas surface | Dev agent (Fable 5) |

## Dev Agent Record

### Agent Model Used

Fable 5 (claude-fable-5)

### Debug Log References

- `npx vitest run src/renderer/src/views/atlas` — 10/10 geometry tests
- `npx vitest run` — 42 files / 286 tests; `npm run typecheck && npm run build` green

### Completion Notes List

- Hand-rolled SVG: `<rect>`/`<text>`/`<line>`/`<marker>` only — no foreignObject, no chart lib. Positions come verbatim from `atlas.graph`; the renderer's only math is viewBox fit/zoom/pan and edge anchoring (pure, unit-tested in `atlas-geometry.ts`).
- Layout constants moved to `src/shared/atlas-layout.ts` so the renderer never imports core code (core `atlas.ts` pulls node:fs).
- Gold budget: open-count pills + blocking-route edges/arrowheads are the canvas's gold; the empty state's "Compose a handoff" is the view's one gold primary (per Dev Notes).
- Keyboard traversal: roving focus over reading order (top→bottom, left→right; Up/Down nearest-in-row) — pure `nextFocus` tested; focus ring drawn as a gold stroke on the card rect because SVG bbox outlines mistrace.
- Live refresh: store-module subscription refetches on `vault.changed`/handoff events (core cache already invalidated); it also patches handoff stamp status in place on `handoff.stateChanged` (pre-work for 10.4 AC1).
- Reduced-motion: rides the existing global `prefers-reduced-motion` kill-switch; the only atlas transition is the 120ms hover stroke.
- Node click selects only at this story's scope — drill is 10.3, resolution is 10.4 (`onActivate` seam already in place).

### File List

- `src/shared/atlas-layout.ts` — NEW: shared card/grid metrics
- `src/core/atlas.ts` — constants import moved to the shared module
- `src/renderer/src/stores/atlas.ts` — NEW: atlas store slice + live-refresh subscription
- `src/renderer/src/views/atlas/AtlasView.tsx` — NEW: view, loading/empty/error states
- `src/renderer/src/views/atlas/AtlasCanvas.tsx` — NEW: SVG canvas, pan/zoom, edges, badges
- `src/renderer/src/views/atlas/AtlasNodeCard.tsx` — NEW: mini routing-slip card (project variant)
- `src/renderer/src/views/atlas/atlas-geometry.ts` + `.test.ts` — NEW: pure geometry + 10 tests
- `src/renderer/src/App.tsx`, `src/renderer/src/stores/app.ts` — sidebar nav entry + view route
- `src/renderer/src/views/search/Palette.tsx` — ⌘K "Vault Atlas" action
- `src/renderer/src/styles.css` — atlas classes, token-only (both themes)

### layout-v2 defect burndown (2026-07-10, Fable 5)

User-reported defects from real screenshots: cards overlapping cluster nodes, edge
count labels clipping under cards, "duplicate" OPEN/REQUEST cards floating with no
edges, content bunched top-left over dead whitespace, clusters cramped in one row,
canvas reading as raw whitespace.

**Root causes found**

- The drilled-level projection (`projectAtlas`) included 1-hop boundary nodes
  (cross-project handoffs/notes, commits) but never positioned them — they piled at
  the base model's default (0,0) under the header row. That single bug produced the
  overlap, the "floating detached cards", AND the "duplicates": two *distinct*
  handoff files whose names differ only by a `-2` suffix (`nimbus-frontend` and
  `nimbus-mobile` both hold `handoffs/2026-07-10-handoff-nimbus-backend.md`)
  truncate to identical card labels and were stacked at the same unpositioned spot.
  The model itself never emitted duplicate nodes (verified against the nimbus
  vault: 20 card files → 20 qualified handoff nodes).
- A real unqualified-id bug DID exist one layer down: `handoffNodeByCardId` keyed
  contract-scan links by the lib card id, so same-named cards in two projects
  silently kept only the last entry (mislinked contract edges). Fixed: the lookup
  is now id → all qualified candidates, and cards are deduped by vault-relative
  path at model build.
- Edge count badges rendered at the raw straight-line midpoint between node
  centers — under cards by construction.
- `fitViewBox` anchored at (0,0) and never centered, so content hugged the
  top-left; overview column/row pitch left no reserved edge channels.

**Layout mechanism (binding spec implemented)**

- Overview: lane columns by route-dependency depth (existing depth logic), cluster
  cards 280px wide, 40px vertical gaps, 160px gutters reserved as card-free edge
  channels (`shared/atlas-layout.ts` is the single box/pitch contract for core
  layout and renderer geometry).
- Edges: orthogonal elbows (H→V→H) with the vertical run always in a channel —
  gutter between lanes, corridor band above the target row for multi-lane spans,
  left channel for same-lane pairs; 1.5px, arrowhead at target; parallel edges
  between the same pair fan ±12px. `N open / M total` labels are white pill chips
  (--bg-card + hairline, mono 10px) anchored ON the horizontal channel segment —
  clearance is geometric, and unit-asserted.
- Learn/Deep: the focused cluster expands into one large white panel (radius 16,
  hairline, shadow-sm) — topic COLUMN groups on the 24px grid (240/144 pitch),
  handoffs in their own trailing lane (thread rails ride its edges); neighboring
  clusters collapse to compact side pills (card-less senders left, neighbors with
  boundary cards head right-side context columns, pill on top, cards beneath).
- Viewport: fit-to-content (48px pad, centered, never past 1:1) on load and level
  change; drag pan; wheel/pinch zoom clamped 0.5×–2× around the fit; ⌘0 refits.
- Surface: the canvas card carries a faint 24px dot grid (both themes); hover =
  raised shadow + gold ring, connected edges emphasized navy, non-neighbors faded
  to 30%. Deterministic throughout — every tie broken by date, label, or id.

**Test evidence**

- `src/core/atlas.test.ts`: `assertLayoutInvariants` (dedupe, pairwise no-overlap
  of real card rects, no-orphans-outside-panels, chip clearance against every
  card) asserted across all three zoom levels — on the fixture source AND the real
  nimbus simulation vault (`loredex-simulation/_machine2/nimbus-vault`), including
  unscoped deep and topic-scoped deep; plus card-dedupe-by-path and
  same-named-cards-stay-distinct/contract-links-reach-every-candidate tests.
- `src/renderer/src/views/atlas/atlas-geometry.test.ts`: elbow routing stays in
  channels, long spans avoid intermediate lane cards, chip clearance, lane fan-out,
  centered fit, zoom clamp band.
- `npm run typecheck`, `npx vitest run` (64 files / 505 tests), `npm run build` —
  all green.

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean.

- Deterministic left→right depth layout computed core-side (`atlas-layout.ts` + geometry tests) — renderer never lays out; SVG only, no chart lib (DESIGN data-viz rule).
- Cluster cards with gold open-count badges; aggregated inter-cluster route edges carry `N open / M total`; pan/zoom + empty/loading states per DESIGN (empty state = serif sentence + one action, and it is the view's one gold primary only when the tour panel is absent).
