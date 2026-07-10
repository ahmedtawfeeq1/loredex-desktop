# Story 10.7: Changed-since overlay + export (stretch) — ATLAS-7

## Status

Approved

## Story

**As a** returning teammate,
**I want** the Atlas to glow what changed since I last looked and to export the current view,
**so that** catching up is visual and the map can leave the app (standup slide, handoff attachment).

## Acceptance Criteria

1. A **changed-since overlay** driven by `activity.feed` + poller events: the user picks a since-point (date, or "since my last visit"); notes/handoffs touched since then **glow**, and their 1-hop neighbors get an **affected ring** (visually distinct from the glow and from search/tour rings); counts shown per project cluster at Overview level.
2. The overlay is a toggle that composes with story 10.6 filters/focus; it updates live as new events arrive (poller integrate, watcher); turning it off restores the plain canvas; reduced-motion replaces any pulse with a static ring.
3. **Export**: an action exports the current viewport (current level, scope, filters, overlay state — what the user sees) as **SVG and PNG** via a native save dialog; exported output uses resolved theme colors (no CSS-variable references), renders correctly on white, and includes a small mono caption (vault name + date).
4. Export and overlay toggle are keyboard-reachable and ⌘K-listed; export is a secondary (navy outline) action — the view's gold budget is untouched.
5. Unit tests cover changed/affected set computation from fixture activity events (touched → glow, 1-hop → ring, others → none), since-point boundaries, live event application, and an SVG export snapshot containing resolved colors.

## Tasks / Subtasks

- [ ] Changed/affected model (AC: 1, 2, 5)
  - [ ] Core or store-side derivation: activity events since cursor → changed node set; 1-hop expansion over the story 10.1 adjacency → affected set; per-cluster counts; live event subscription
- [ ] Overlay rendering (AC: 1, 2)
  - [ ] Glow + affected ring styles (both themes, distinct from search/tour rings); toggle + since-picker UI; reduced-motion variant
- [ ] Export (AC: 3, 4)
  - [ ] SVG serialization of the current canvas with resolved token colors + caption; PNG rasterization; main-process save dialog; ⌘K entries
- [ ] Tests (AC: 5)

## Dev Notes

- This is the UA diff-overlay concept translated: their changed/affected node sets from `/understand-diff` become a **changed-since overlay from `activity.feed` + poller events** — "notes touched since a date/sha glow, their 1-hop neighbors ring." The ATLAS-7 slice adds "SVG/PNG export of the current viewport." Stretch story: independent of 10.5/10.6 once 10.1–10.4 land; cut cleanly if the cycle runs long. [Source: plan/ATLAS-CONCEPT.md#2-concept-translation-understand-anything--loredex-vault-atlas] [Source: plan/ATLAS-CONCEPT.md#story-slices-realistic-sequential-where-marked]
- Activity events and the poller already exist (epic 6 grammar + feed; epic 9 poller) — this story derives sets from them, it does not add event kinds or persistent state; the Atlas stays a pure consumer of `rebuildIndexes`-fresh truth per §5 invalidation rules. "Since my last visit" may key off read-state/app-db without writing anything new to the vault. [Source: plan/ATLAS-CONCEPT.md#5-implementation-notes-for-our-stack] [Source: architecture-m2.md#8-ipc-additions]
- Ring taxonomy discipline: selected/search-tier/tour/changed/affected must stay visually distinguishable (UA solved this with distinct ring states on one card component — do the same on `AtlasNodeCard`); glow is not gold — gold stays reserved for path/blocked/primary per the Atlas gold budget. [Source: plan/ATLAS-CONCEPT.md#1-what-understand-anything-actually-does-verified-from-source] [Source: DESIGN.md#tokens]
- Export serializes the hand-rolled SVG we already render (no chart lib = no export lib); resolve CSS custom properties to literal colors at serialization time so the file stands alone. [Source: DESIGN.md#data-visualizations-dependency-graph-contract-timeline]
- Depends on stories 10.1–10.4. Files: overlay derivation (in/next to `src/core/atlas.ts` or the atlas store slice), `views/atlas/ChangedSinceToggle.tsx`, `export.ts`, main-process save-dialog handler.

### Testing

- Unit: fixture activity stream + since-point → exact changed/affected/none partition; boundary events (at the since-point) included once; live event moves a node into the glow set; SVG snapshot has no `var(--…)` references and contains the caption; a11y on toggle + export actions. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from ATLAS-CONCEPT.md §5 (ATLAS-7, stretch) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

### Debug Log References

### Completion Notes List

### File List

## QA Results
