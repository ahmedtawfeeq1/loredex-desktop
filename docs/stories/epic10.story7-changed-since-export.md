# Story 10.7: Changed-since overlay + export (stretch) — ATLAS-7

## Status

Done

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

- [x] Changed/affected model (AC: 1, 2, 5)
  - [x] Core or store-side derivation: activity events since cursor → changed node set; 1-hop expansion over the story 10.1 adjacency → affected set; per-cluster counts; live event subscription
- [x] Overlay rendering (AC: 1, 2)
  - [x] Glow + affected ring styles (both themes, distinct from search/tour rings); toggle + since-picker UI; reduced-motion variant
- [x] Export (AC: 3, 4)
  - [x] SVG serialization of the current canvas with resolved token colors + caption; PNG rasterization; main-process save dialog; ⌘K entries
- [x] Tests (AC: 5)

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

claude-fable-5 (Claude Code)

### Debug Log References

- `npx vitest run` — 51 files / 362 tests green (changed-since partition/boundary/live suites, export var-resolution + standalone-SVG suite)
- `npx tsc --noEmit` clean; `npm run build` green
- Dev-launch smoke: app alive 45 s, 0 core-host exits, no errors (after a one-off `npx electron-rebuild` for better-sqlite3 — see deviations)

### Completion Notes List

- Derivation is pure renderer-side set logic (`changed-since.ts`): events at-or-after the since-point map onto the FULL model (a deep unscoped `atlas.graph` fetch, cached core-side) so Overview — which renders no note nodes — still gets per-cluster counts (parsed from typed ids). Affected = 1-hop over the SHOWN (filtered) edges, so the overlay composes with 10.6 filters/focus; toggling off restores the plain canvas.
- Live updates: `vault.changed` paths union into the glow set immediately (`withLiveChanges`); the graph reload then re-runs `refreshOverlay` for full reconciliation. No new event kinds, no persistent state.
- "Since my last visit" keys off a renderer-local localStorage stamp (one per app session; the previous one is the last visit). DEVIATION: per-user UI pref lives in localStorage rather than app-db — the story allows read-state/app-db but a settings channel for one timestamp failed the shortest-diff test; losing it costs one default since-point.
- Ring taxonomy: changed = --ok glow + soft pulse (global reduced-motion rule freezes it to the static ring), affected = dashed --ok ring; changed wins when a node is both. Both distinct from navy search tiers and gold tour/path rings; no gold spent.
- Export serializes the hand-rolled SVG: `.atlas` CSS rules collected from the app stylesheets with every `var(--…)` resolved to literals (fixed-point, fallback-aware), solid `--bg-app` background, mono caption `<vault> · <date>`; PNG rasterizes the same SVG at 2x. Saved via a new main-owned native save panel (`loredex:save-export`); receipt toast with the written path. Both actions are toolbar secondaries + ⌘K-listed.

### File List

- src/renderer/src/views/atlas/changed-since.ts + .test.ts (new: pure sets)
- src/renderer/src/views/atlas/export.ts + .test.ts (new: resolveCssVars, buildExportSvg, collectors, exportAtlasView)
- src/renderer/src/views/atlas/ChangedSinceToggle.tsx (new: toggle row + since picker + counts)
- src/renderer/src/views/atlas/decor.ts (changed/affected classes), AtlasNodeCard.tsx (cluster changed-count), AtlasCanvas.tsx (changedCounts pass-through), AtlasView.tsx (toolbar + decor + panel)
- src/renderer/src/stores/atlas.ts (overlay state, last-visit stamp, live union)
- src/renderer/src/views/search/Palette.tsx (⌘K overlay/export actions)
- src/main/dialogs.ts + src/main/index.ts (saveExportDialog + handler), src/preload/index.ts, src/renderer/src/api.ts (saveExport bridge)
- src/renderer/src/styles.css (glow/affected rings, toggle switch, counts)

## QA Results
