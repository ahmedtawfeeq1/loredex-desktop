# Story 22.1: Powerful search — operators, ranked results, recents

## Status

Done

## Story

**As a** person who knows *roughly* what they're looking for (a project, a date window, a tag, a handoff route) but not the exact note,
**I want** the Search view and the ⌘K palette to parse query operators (`project:` `topic:` `type:` `status:` `tag:` `from:` `to:` `before:` `after:` `on:` + bare full-text), show removable filter chips synced to the facet selects, and return ranked results with a project tint dot, humanized title, highlighted snippet, meta, keyboard nav, a result count, a group-by-project toggle, and recent/saved searches,
**so that** I can narrow deterministically and re-run past searches without leaving the keyboard, per DESIGN.md "D1 amendment 7 §B — Powerful search".

## Acceptance Criteria

1. **Query operators, parsed client-side.** One raw query string is the source of truth. A pure parser splits it into bare full-text `terms` + typed `filters`: `project:` `topic:` `type:` `status:` `tag:` `from:` `to:` (frontmatter facets) and `before:`/`after:`/`on:` (filed-note date). Quoted values (`topic:"rate limiting"`) supported; last operator wins; unknown `foo:bar` falls through as a bare term; case-insensitive operator keys.
2. **Deterministic pre-rank narrowing.** Operators map 1:1 to the core `Facets` transport and narrow through the SAME `vault.search` seam the facet selects use — full-text ranking stays the lib's `searchVault`, facets/operators narrow it. `tag:` reads frontmatter `tags` (list or scalar, case-insensitive); `before`/`after`/`on` compare the hit's filed date lexically (undated notes drop under any date bound).
3. **Chips + synced facet builder.** Each active filter renders as a removable chip (`project: nimbus-backend ×`); the existing facet selects (project/topic/type/status/from/to) stay and now read from the parsed filters + write back to the query string (`setOperator`). Chip × and select change both mutate the one query string.
4. **Ranked results.** Each row = project tint dot (`sectionTint(hit.project)`), humanized title (story 17.1), matched-**bare-term**-highlighted snippet + title (operators never highlight), type/status/topic/date meta, real filename on the tooltip. Result **count** in the header. **Group-by-project** toggle (projects in best-rank order, hits keep rank order in-group). Keyboard ↑/↓/Enter opens (stable across grouped/flat).
5. **Recent + saved searches.** Last-8 recent queries (raw, with operators) persist in localStorage, one-click re-run as chips on the idle state; optional saved-search chips (toggle "Save search"). Degrades to session-only without storage.
6. **⌘K palette.** Same parsed query + backend. Shows the top 5 note hits + a "See all N in Search →" row when there are more; opening a hit records it to recents.
7. **DoD.** Parser unit tests (each operator, combined, date ranges, bare terms, quoted, round-trip); ranking/highlight test; recents persistence test; core tag/date narrowing test; full gate green (typecheck, full vitest sequential, build).

## Tasks / Subtasks

- [x] Parser (AC 1, 3, 4): `src/renderer/src/views/search/query-parser.ts` — `parseQuery` (tokenizer respecting quotes; known ops → filters last-wins, unknown → bare terms), `filtersToFacets`, `setOperator` (upsert/remove one op token, quotes spaced values, leaves the rest verbatim), `activeFilters` (chip order), `groupHitsByProject` (rank-preserving).
- [x] Core narrowing (AC 2): `Facets` extended with `tag`/`before`/`after`/`on` (`src/shared/types.ts`); `matchesFacets` (`src/core/facets.ts`) gains tag (frontmatter `tags`, list-or-scalar, lowercased set) + date-bound comparison on `hit.date`. `filterHits` early-out and the `vault.search`/`vault.facets` handlers unchanged — the operators ride the existing facets param.
- [x] Store (AC 1, 3, 5, 6): `src/renderer/src/stores/search.ts` — `q` is the source of truth; `parsed = parseQuery(q)` derived on every `setQuery`; `runSearch` sends `{ q: parsed.terms, facets: filtersToFacets(parsed.filters) }`; `setFilter` (facet/chip → `setOperator` → re-query); `groupByProject`/`toggleGroupByProject`; `recentSearches`/`savedSearches` (localStorage), `recordSearch`, `toggleSaved`. Recent NOTES fallback kept, distinct from recent SEARCHES.
- [x] Recents module (AC 5): `src/renderer/src/stores/search-recents.ts` — pure `pushRecent`/`toggleSaved` + `loadStrings`/`saveStrings` (localStorage wrapper, degrades).
- [x] Search view (AC 3, 4, 5): `SearchView.tsx` — chips row, selects read/write filters, count, group-by toggle + grouped rendering, tint-dot rows, highlight over `parsed.terms`, idle-state recent/saved chips, "Save search" toggle.
- [x] Palette (AC 6): `Palette.tsx` — top-5 hit cap + "See all N in Search →" row (→ `setView('search')`); `recordSearch` on pick.
- [x] CSS: chips, tint dot (`.file-search-dot`), count, `.facet-toggle`, quick chips, group heads.
- [x] Tests (AC 7): `query-parser.test.ts`, `search-recents.test.ts`, `facets.test.ts` (+tag/date describe).

## Dev Notes

- DESIGN.md "D1 amendment 7 §B", read verbatim, is the binding spec. [Source: DESIGN.md#d1-amendment-7]
- **One query string, one narrowing seam.** Rather than a second search index or a parallel client-side filter, the parsed operators become `Facets` and ride the existing `vault.search` → `engine.search` → `filterHits` path. `searchVault` still ranks; operators/facets still narrow. That keeps CLI/MCP/desktop on one search semantics and made "narrow deterministically pre-rank" a two-line extension of `matchesFacets` (date on `hit.date`, tag on memoized frontmatter). No handler change: the operators are just more facet keys.
- **Facet selects and chips edit the query, not a separate facet object.** The old store held a `facets` object alongside `q`; syncing "the selects stay, now synced to the query" is cleanest when the query string is the single source of truth and both the chips and the selects call `setOperator(q, key, value)`. `parse(setOperator(...))` round-trips (tested), so the two representations can never drift.
- **Two recents, deliberately distinct.** `recents` = recent NOTES (reader selections, the palette's empty-query fallback, pre-existing). `recentSearches` = recent QUERIES (this story). Different lists, different lifetimes — search recents are app-wide localStorage and survive vault change; note recents reset per vault.
- **Recorded on open, not per keystroke.** `recordSearch()` fires when a result is opened from the Search view or the palette — the searches you actually ran — not on every debounced query, which would fill recents with partial typing. File-pane content search (its own store) never touches this.
- **`tag:` click already wired.** epic20's Properties panel calls `setQuery('tag:<t>')`; with the parser that now correctly narrows by the `tag` operator instead of being treated as literal full-text — a free upgrade.

## Deviations

- **`before`/`after`/`on` compare `hit.date`, not frontmatter.** The `SearchHit` already carries the filed date; using it avoids a frontmatter parse per hit for date bounds and matches the humanized-title date semantics. `tag:` still reads frontmatter (tags aren't on the hit).
- **No `tag`/date facet SELECTS.** The amendment names selects for the existing six facets only; `tag`/date are operator-and-chip only (no vocabulary aggregation added), which keeps `aggregateFacetValues`/`vault.facets` untouched.
- **App visual drive skipped** per the standing QA convention (dev launch needs electron-rebuild → node-test ABI break). Verification is the pure-module + core test coverage of the DoD plus the full gate.

## Dev Agent Record

- 2026-07-11: implemented as specced. New pure modules `query-parser.ts` + `search-recents.ts`; `search` store rewritten around one query string; `Facets` + `matchesFacets` extended for tag/date; SearchView + Palette upgraded; CSS added. Gate: `npm run typecheck` clean (node+web), full `npx vitest run --no-file-parallelism` **909/909** (+51 over the 858 baseline: parser 24, recents 12, core tag/date 2, and the pre-existing suites intact), `npm run build` clean (the api/app/toasts dynamic-import warnings are pre-existing, unrelated). No new dependencies.

## QA Results

- 2026-07-11 fresh-eyes (commit `6a5fcbf`): **PASS.** `parseQuery` quote-aware tokenizer parses all ten operators (`project/topic/type/status/tag/from/to/before/after/on`), last-wins, unknown `foo:bar` falls through as a bare term; `setOperator` round-trips. Operators map to the core `Facets` transport (`filtersToFacets`) and narrow PRE-rank through the same `vault.search` seam via `matchesFacets` (+tag list-or-scalar, +date bounds) — no second index. Ranked results: humanized title, project tint dot, bare-term-only highlight, group-by-project (`groupHitsByProject`, rank-preserving), result count, up/down/enter. Recents cap-8 dedup persistence (`search-recents.ts`), saved-search chips, ⌘K top-5 + "See all". Tests `query-parser.test.ts` / `search-recents.test.ts` / `facets.test.ts` green in 933/933.
