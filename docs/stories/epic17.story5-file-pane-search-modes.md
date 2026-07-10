# Story 17.5: File-pane search modes (Name | Content)

## Status

Done

## Story

**As a** vault reader who knows a phrase is *somewhere* in the vault but not which file,
**I want** the file-pane "Search files…" box to offer a Name | Content toggle — Name filters the tree by title (as today), Content runs a full-text vault search and shows a flat result list with humanized titles, project tint dots, highlighted snippets, and dates — Enter opens the top hit, Esc back to the tree,
**so that** I can find notes by their contents without leaving the reader, per DESIGN.md "D1 amendment 3 — File-pane search modes".

## Acceptance Criteria

1. **Segmented toggle.** The "Search files…" box gains a **Name | Content** segmented control (the DESIGN segmented pattern: `--bg-inset` track, active segment on `--bg-card`).
2. **Name mode.** Unchanged from today — the query filters the tree via `filterTree` (matches machine + humanized titles); the tree stays visible.
3. **Content mode.** The query runs `vault.search` full-text (debounced 150ms). The tree is **replaced** by a flat result list; each row = project tint dot + humanized title (story 1 util) + term-highlighted snippet + date; the real filename rides the row tooltip. Clicking a row opens it in the reader.
4. **Enter / Esc.** In Content mode, **Enter** opens the **top hit**; **Esc** clears back to the tree (returns to Name mode, empty query, no results).
5. **Isolation.** The file-pane content search is a dedicated store, separate from the Search view / ⌘K palette store — typing here never contaminates the Search view's query or hits. It resets on vault change.
6. **DoD.** Content-mode store tests (query→results mapping, mode split, Enter/Esc behavior, stale-result guard, error path); full gate green (typecheck, full vitest, build).

## Tasks / Subtasks

- [x] Store (AC: 3, 4, 5, 6): `src/renderer/src/stores/fileSearch.ts` — `mode` (`'name'|'content'`), `query`, `results`, `searching`, `error`; `setMode` (content + live query → run; name → drop results, keep query), `setQuery` (debounced content search only), `runContentSearch` (seq-guarded `vault.search`, empty→null, error→[]+message), `topHit`, `openTop(open)` (Enter → opens results[0] through the passed opener), `escape` (Esc → name/empty/null), `reset`.
- [x] Toggle + rows (AC: 1, 2, 3): `VaultTree` reads `mode`/`query` from the store (dropping the local `useState`); a `.tree-mode` segmented control; Content mode renders `<ContentResults>` (a `.file-search-dot` tinted by `sectionTint(hit.project)`, reused `.search-row` recipe, `Highlight` over the humanized title + snippet, `hit.date`), else the tree. Input `onKeyDown`: Esc → `escape`, Enter (content) → `openTop(openSearchResult)`.
- [x] Reuse (AC: 3): `Highlight` imported from `SearchView`, `openSearchResult` from `stores/search`, `sectionTint` from `sectionTint.ts`, `humanizeTitle` from `humanize.ts` — no re-implementation, one highlight/open/tint/title definition each.
- [x] Hygiene (AC: 5): `useFileSearch.reset()` added to `App`'s `onVaultChanged` reset list.
- [x] Tests (AC: 6): `fileSearch.test.ts` — starts in Name; Name never calls the backend; switch-to-Content-with-query runs a search; switch-back-to-Name drops results keeps query; query→results mapping; empty query no-op; error surfaces `[]`+message; stale in-flight never clobbers newer; `openTop` opens results[0] (false when none); `escape` returns to Name/empty/null.

## Dev Notes

- DESIGN.md "D1 amendment 3", the "File-pane search modes" paragraph, read verbatim, is the binding spec. [Source: DESIGN.md#d1-amendment-3]
- **Dedicated store, not the Search store.** The main `search` store backs the full Search view AND the ⌘K palette; sharing it would make file-pane typing flip the Search view's query/hits (and vice-versa). `fileSearch` is its own tiny store with the same debounce+seq-guard shape as `search`, so behavior is familiar without the coupling.
- **One query box, two meanings.** The single input drives the tree filter in Name mode and the full-text search in Content mode. Moving `query` from `VaultTree` local state into the store lets Esc "clear back to the tree" reset both the mode and the box from one place, and lets `openTop`/`escape` be node-testable without the DOM.
- **Enter opens the TOP hit, by spec** — not a selected row. `openTop(open)` takes the opener as an argument so the store test asserts the behavior (`open` called with `results[0].path`) without dragging the reader/app stores into a node test; the component passes the shared `openSearchResult`.
- **Highlight over humanized titles** carries the story-1 nuance: a dash-spanning query (`error-handling`) highlights nothing in the humanized title but still matches (and highlights in the snippet). Recorded, accepted — the hit comes from the backend.

## Deviations

- **Content rows reuse `.search-row`** (the Search view recipe) plus a small tint-dot head, rather than a bespoke row class — same visual language, less CSS, and the styles live in `VaultTree`'s scoped `<style>` (styles.css is a concurrent-workflow file).
- **App visual drive skipped** per the standing QA convention (dev launch needs electron-rebuild → node-test ABI break). Verification is the full store test coverage of the DoD plus the full gate.

## Dev Agent Record

- 2026-07-10: implemented as specced. Gate: typecheck (node+web) clean, full vitest 828/828 sequential (`--no-file-parallelism`), production build clean, e2e release gate 18/18. Same concurrent-atlas-batch caveat as story 17.4 (foreign uncommitted `atlas*`/`_diag*` files failed 2 atlas tests + the build typecheck; confirmed not mine — baseline atlas + my changes are 828/828 green and build clean — restored untouched, only my files committed).
