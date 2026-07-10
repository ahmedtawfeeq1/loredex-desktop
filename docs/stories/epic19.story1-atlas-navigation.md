# Story 19.1: Atlas trackpad navigation + header breathing room

## Status

Done

## Story

**As a** person exploring the Vault Atlas on a MacBook,
**I want** the canvas to answer to the trackpad the way every other Mac app does — pinch to zoom toward my cursor, two-finger scroll to pan, a floating +/−/fit/1:1 control cluster, and ⌘=/⌘−/⌘0 — and I want the toolbar to stop kissing its card border,
**so that** navigating the map feels native instead of like dragging a physics diagram, and the header reads as a calm titled toolbar — per DESIGN.md "D1 amendment 5 — atlas navigation + header breathing room".

## Acceptance Criteria

1. **Trackpad gestures.** On the canvas: pinch (wheel + ctrlKey) zooms toward the cursor, clamped 0.4×–2.5× of the fit; a plain two-finger scroll pans (wheel dx/dy → translate; shift maps a vertical wheel to horizontal). Every gesture `preventDefault`s so the page/pane never scrolls. Existing drag-pan is unchanged.
2. **On-canvas zoom controls.** A floating bottom-right pill stack (`--bg-card` / hairline / shadow-sm): `+` / `−` / `⌖` fit-to-content / `1:1` reset — 28px mono-glyph buttons, each with a tooltip, wired to keyboard ⌘= (in) / ⌘− (out) / ⌘0 (fit). The three shortcuts are registered in the global action registry so ⌘K palette coverage stays green.
3. **Header breathing room.** The 44px toolbar row gets 16px horizontal + 12px vertical padding so the VAULT ATLAS eyebrow, the segmented zoom control, the breadcrumb and the action pills never touch the border; the hairline divider sits below the toolbar, not at the top edge; the canvas card is inset 16px from the ground on the sides + bottom. The 8px inter-group action gaps are preserved.
4. **Smoothness.** CSS transform transitions ≤120ms on the controls, disabled under `prefers-reduced-motion` (via the global reduced-motion rule).
5. **DoD.** Unit tests for zoom clamp math, cursor-anchored zoom, pan delta application, reset-to-1:1, and the control→action wiring; the header padding/inset asserted via the design-fidelity CSS pattern; all existing atlas invariants stay green (shelf-wrap ≥3 rows, no-overlap, clearance, density fill, readable fit floor). Gate: typecheck + full atlas vitest + build green.

## Tasks / Subtasks

- [x] Clamp constants (AC: 1): `src/shared/atlas-layout.ts` — `ZOOM_MIN_SCALE = 0.4`, `ZOOM_MAX_SCALE = 2.5`; `atlas-geometry.ts#zoomViewBox` clamps `vb.w` to `[fitW/ZOOM_MAX_SCALE, fitW/ZOOM_MIN_SCALE]` (was the 0.5–2 band). Anchor-fixed math unchanged.
- [x] Pure helpers + command bus (AC: 1, 2): `src/renderer/src/views/atlas/atlas-zoom.ts` — `wheelZoomFactor`, `zoomAtCenter`, `resetOneToOne`, `wheelPan` (pure viewBox math over the geometry primitives), and a module-level `setZoomHandler`/`dispatchZoom` bus so the pills, shortcuts and palette all drive the one canvas that owns the live viewBox.
- [x] Canvas gestures + controls (AC: 1, 2, 4): `AtlasCanvas.tsx` — a NATIVE non-passive `wheel` listener (React's synthetic wheel is passive, so `preventDefault` would not hold): ctrlKey → cursor-anchored pinch zoom, else two-finger pan (shift = horizontal). Floating `.atlas-zoom-controls` pill stack rendered in the pane; each button calls the pure helper. The old React `onWheel` and the local ⌘0 window listener are removed (⌘0 now flows through the registry → bus).
- [x] Registry actions (AC: 2): `actions/registry.ts` — global `action:zoom-in` (⌘=), `action:zoom-out` (⌘−), `action:zoom-fit` (⌘0); `run()` self-guards on `view === 'atlas'` and calls `dispatchZoom`. Ids kept OUT of the `action:atlas-*` namespace (that prefix is the Atlas-only contextual palette rows that must never leak off-view). Auto-listed in ⌘K + cheatsheet.
- [x] CSS (AC: 3, 4): `views/atlas/atlas.css` — `.atlas > .atlas-header { padding: 12px 16px; border-bottom: 1px hairline }`, `.atlas > .atlas-pane { position: relative; margin: 0 16px 16px }`, and the `.atlas-zoom-controls` / `.atlas-zoom-btn` recipe (bottom-right card, 28px mono buttons, 120ms transition). Child-combinator selectors win over the base `.atlas-*` rules regardless of stylesheet load order.
- [x] Tests (AC: 5): `atlas-zoom.test.ts` (clamp band, cursor-anchored fixed-point, pan deltas incl. shift-axis, 1:1 reset + band re-clamp, command bus bind/unbind incl. stale-unbind safety, registry ⌘=/⌘−/⌘0 wiring + off-view no-op); `atlas-fidelity.test.ts` (design-fidelity CSS pattern: header padding/divider, 16px inset, pill-stack recipe, no border > 1px); `atlas-geometry.test.ts` clamp assertions updated to the 0.4–2.5 band.

## Dev Notes

- DESIGN.md "D1 amendment 5" read verbatim is the binding spec; the amendment-3 header-redesign paragraph is the toolbar structure this builds on. [Source: DESIGN.md#d1-amendment-5]
- **Why a native wheel listener.** React attaches `onWheel` as a passive listener, so `e.preventDefault()` is ignored and the `overflow-y: auto` pane-board would scroll under the gesture. The canvas registers its own `addEventListener('wheel', …, { passive: false })` and reads the live viewBox from a ref (`vbRef`) so the listener subscribes once for the component lifetime.
- **One viewBox owner, a command bus for everyone else.** The viewBox is `AtlasCanvas` local state. A real fit needs the live `fitRects`/pane the component alone holds, so rather than lift state into a store (out of this story's scope) the shortcuts and palette `dispatchZoom(cmd)` and the mounted canvas — registered via `setZoomHandler` — applies it against the current frame. The applier closure is reassigned each render (always the live viewBox); the registration itself is a single stable `useEffect`.
- **Clamp semantics.** Zoom scale is measured relative to the fitted view (`scale = fitW / vb.w`), so the band `[0.4, 2.5]` maps to `vb.w ∈ [0.4·fitW, 2.5·fitW]`. The tour fit (`fitViewBoxAround`) keeps its own `fitW/2` zoom-in cap — unrelated to interactive zoom and pinned by `tour-playback.test.ts`.
- **Header inset, not a new card.** The view already sits inside the shell's `.pane-board` card (bg-card + hairline + shadow, ~12px from the ground). The amendment's complaint was the INNER content kissing that card's border; the fix is the toolbar's own 16px/12px padding + the 16px canvas inset, matching the `.board-header` pattern other views use.

## Deviations

- **App visual drive skipped** per the standing QA convention (a dev launch needs electron-rebuild, which breaks the node-test ABI). Verification is the full pure-helper + wiring + CSS-fidelity coverage of the DoD plus the full gate.
- **Smoothness is control-level, not viewBox-animated.** SVG `viewBox` is not reliably CSS-transitionable, so the ≤120ms transition rides the pill buttons (background) rather than the canvas transform; the global `prefers-reduced-motion` rule in styles.css disables it. Momentum/inertia was explicitly not required.

## Dev Agent Record

- 2026-07-10: implemented as specced. Gate: typecheck (node+web) clean; `npx vitest run src/renderer/src/views/atlas src/renderer/src/actions src/renderer/src/design-fidelity.test.ts` → 172/172 (14 files; +new atlas-zoom + atlas-fidelity suites); production build clean. Existing atlas invariants (shelf-wrap, no-overlap, clearance, density fill, readable fit floor) untouched and green; only the zoomViewBox clamp assertions were updated to the amended 0.4–2.5 band. No new dependencies. Files: `shared/atlas-layout.ts`, `views/atlas/atlas-geometry.ts`(+test), `views/atlas/atlas-zoom.ts`(+test), `views/atlas/AtlasCanvas.tsx`, `views/atlas/atlas.css`, `views/atlas/atlas-fidelity.test.ts`, `actions/registry.ts`.
