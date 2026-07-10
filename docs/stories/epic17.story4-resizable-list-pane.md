# Story 17.4: Resizable list pane

## Status

Done

## Story

**As a** vault reader working a real vault (~25 topics in one project, long dated filenames),
**I want** to drag the divider between the file list and the reader to make the list wider or narrower — clamped to a sensible band, double-click to reset, remembered per vault,
**so that** long humanized titles fit without truncation and the reader still gets the room it needs, per DESIGN.md "D1 amendment 3 — Resizable list pane".

## Acceptance Criteria

1. **Drag handle.** A col-resize handle sits on the file-list/reader divider; dragging resizes the list pane live. The width is clamped to **200–480px**.
2. **Reset.** Double-clicking the handle resets the width to **300px**.
3. **Cursor.** The handle shows a `col-resize` cursor and a gold hover/drag cue; the focus ring is the standard gold.
4. **Persistence.** The width persists **per vault**, in app.db, beside the rails-collapse state (a sibling `app_settings` row). A new vault, or a hand-edited/corrupt row, degrades to the 300px default; an out-of-band stored value reads back clamped.
5. **Collapse unchanged.** The ⌘⇧\ list-collapse behavior (story 16.2) is untouched — while collapsed the pane is 0 and the handle is not rendered; expanding restores the persisted width.
6. **DoD.** Clamp tests (band + rounding + default fallback) and persistence tests (core round-trip + store drag/commit/reset/load); full gate green (typecheck, full vitest, build).

## Tasks / Subtasks

- [x] Pure clamp (AC: 1, 2, 6): `src/renderer/src/views/reader/listPaneWidth.ts` — `MIN_LIST_WIDTH=200`, `MAX_LIST_WIDTH=480`, `DEFAULT_LIST_WIDTH=300`, `clampListWidth` (rounds; non-finite → default). ONE definition shared by the store, the handle, and core.
- [x] Store (AC: 1, 2, 4, 5): `stores/rails.ts` gains `listWidth`, `resizing` (session-only), `dragListWidth` (clamps, NO persist — live), `commitListWidth` (persist current), `resetListWidth` (→300 + persist), a `setResizing`; `load()` reads the width from its own `settings.listWidth.get` row (independent degrade); `reset()` returns to the 300 default.
- [x] Handle (AC: 1, 2, 3, 5): `src/renderer/src/views/reader/ListResizeHandle.tsx` — a `role="separator"` div with pointer-capture drag (down → record start x+width + `setResizing(true)`; move → `dragListWidth`; up/cancel → `commitListWidth` + `setResizing(false)`), double-click → `resetListWidth`. Scoped `<style>` (styles.css is a concurrent-workflow file). Rendered by `App` between `VaultTree` and the reader, only while the list is expanded.
- [x] Width application (AC: 1, 5): `VaultTree` applies `style={{ width: listWidth }}` only when NOT collapsed (so `.rail-collapsed { width: 0 }` still wins), and adds a `list-resizing` class that kills the width transition mid-drag (scoped `.pane-list.list-resizing { transition: none }` + `.pane-list { position: relative }`).
- [x] Core persistence (AC: 4): `settings.ts` `loadListPaneWidth`/`saveListPaneWidth` (app_settings key `listWidth`, defensive clamp on both ends, malformed → 300); `handlers.ts` `settings.listWidth.get/set` (get degrades to `{ width: 300 }` with no vault/db); `ipc-contract.ts` channel types.
- [x] Tests (AC: 6): `listPaneWidth.test.ts` (band edges, floor/ceil, rounding, non-finite fallback); `rails.test.ts` (load applies + clamps stored width, drag clamps + does NOT persist, commit persists, reset→300 persists, best-effort on failure); `settings.test.ts` (round-trip, clamp on save+load, per-vault isolation, malformed→300, lives beside the rails row).

## Dev Notes

- DESIGN.md "D1 amendment 3", the "Resizable list pane" paragraph, read verbatim, is the binding spec. [Source: DESIGN.md#d1-amendment-3]
- **"Next to the rails state" = a sibling app_settings row.** The width rides its OWN `settings.listWidth` channel and `app_settings` key, keyed by the same vault id as `rails` — the exact `treeSections` seam (story 16.3). Folding it into the `rails` payload would have changed `RailsCollapsed` and its many exact-match tests; a sibling row is additive and leaves the rails-collapse contract untouched.
- **Two-speed width writes.** `dragListWidth` mutates state only (no app.db write per pointermove); `commitListWidth` persists once on pointerup. So a drag is one write, not hundreds — the theme/rails best-effort persistence pattern, extended.
- **Live tracking.** `.pane-list` carries a `transition: width 160ms` for the collapse animation; during a drag that would rubber-band the pane behind the cursor, so `resizing` toggles a `list-resizing` class that sets `transition: none`. Cleared on pointerup.
- **Clamp lives in three places on purpose, from one source.** The renderer store and handle import `clampListWidth`; core keeps a small defensive copy (a hand-edited app.db row must never widen the pane past 480). Both are the same 200/480/300 constants.

## Deviations

- **Handle is a flex divider, not an in-pane overlay.** An absolutely-positioned handle inside `.pane-list` (an `overflow-y: auto` scroller) top-anchors to content and scrolls out of view; a `position: sticky` variant fought the sticky header. The robust, no-restructure choice is a thin flex-item divider between the two panes — always full height, never scrolls. It adds one 12px `.app` gap slot (reader ~18px narrower); no styles.css / design-fidelity token changed.
- **Keyboard resize out of scope.** D1a3 specs a drag handle + double-click reset (pointer affordances); the separator is not a focusable arrow-resize widget. Collapse (⌘⇧\) remains the keyboard path to reclaim reader width.
- **App visual drive skipped** per the standing QA convention (a dev launch needs electron-rebuild, which breaks the node-test ABI). Verification is the full pure/store/core test coverage of the DoD plus the full gate.

## Dev Agent Record

- 2026-07-10: implemented as specced. Gate: typecheck (node+web) clean, full vitest 828/828 sequential (`--no-file-parallelism`; +this story's cases), production build clean, e2e release gate 18/18. Concurrency note: a concurrent atlas batch had uncommitted edits to `atlas.ts`/`atlas-geometry.ts`/`atlas-layout.ts` + two `_diag*.test.ts` scratch files in the working tree that failed 2 atlas tests and the build typecheck; confirmed NOT mine (baseline atlas + my changes = 828/828 green, build clean), those files left untouched and restored, only my files committed.
