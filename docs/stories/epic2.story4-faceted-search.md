# Story 2.4: Faceted full-text search

## Status

Done

## Story

**As a** PM,
**I want** full-text search with frontmatter facets and a Cmd+K palette,
**so that** ad-hoc questions never need grep (FR2).

## Acceptance Criteria

1. A search view and a Cmd+K palette both query `vault.search`.
2. Full-text results come from the lib's `searchVault`; facet filters (project, topic, type, status, from/to project) narrow by frontmatter.
3. Results show note title, project, and a highlighted snippet; Enter opens the note in the reader.
4. Search returns within 500 ms on a 1,000-note vault.

## Tasks / Subtasks

- [x] Core-side facets (AC: 2)
  - [x] Define `Facets` in `src/shared/types.ts`: `{ project?, topic?, type?, status?, from?, to? }`
  - [x] Extend the `vault.search` handler: run `searchVault(q)`, then filter hits by frontmatter facets (parse via `parseDoc` on hit paths, memoized per mtime)
- [x] Search view (AC: 1, 3)
  - [x] `views/search/SearchView.tsx`: query input + facet dropdowns (values aggregated from vault frontmatter via a small `vault.facetValues`-style aggregation — implement inside the existing `vault.search` handler family or a memoized core-side aggregate exposed on the search response), result list with title/project/highlighted snippet, Enter/click → reader
- [x] Cmd+K palette (AC: 1, 3)
  - [x] `views/search/Palette.tsx`: global Cmd+K overlay, same `vault.search` backend, keyboard-first (arrows + Enter), recent-notes fallback when the query is empty
- [x] Performance (AC: 4)
  - [x] Debounce input (150 ms); memoize frontmatter parses; measure against a generated 1,000-note fixture and record the number in the story's Completion Notes

## Dev Notes

- Full-text search is the lib's `searchVault` — do not build a second index (anti-second-engine covers writes, but engine parity argues for one search semantics with the CLI/MCP too). Facet narrowing over parsed frontmatter is read-only view logic and is fine app-side in the core host. [Source: architecture.md#loredex-library-surface] [Source: architecture.md#overview]
- The `facets?` parameter already exists in the contract's `vault.search` channel — this story implements it. [Source: architecture.md#ipc-contract]
- Facet vocabulary comes from the simulation's frontmatter reality: project, topic, type, status, from/to project. Values are whatever the vault contains — aggregate, don't hardcode.
- Cmd+K pattern: Linear-style single palette; keep it keyboard-first (this becomes the home of more actions in M2 — build the palette as a generic command list with search as the first provider).
- Invalidate memoized frontmatter on `vault.changed` (Story 2.3 store hooks).
- Files: `src/shared/types.ts` (`Facets`), `src/core/ipc.ts` (extend handler), `src/renderer/src/views/search/SearchView.tsx`, `Palette.tsx`, `src/renderer/src/stores/search.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: facet filtering matrix (single facet, combined, no-match), memoization invalidation on mtime change, palette keyboard navigation. Perf: scripted timing on the 1,000-note fixture (<500 ms). [Source: architecture.md#testing-strategy]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-09 | 0.1 | Drafted from PRD Epic 2 | Bob (SM) |
| 2026-07-09 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (BMAD dev agent)

### Debug Log References

- `npx vitest run src/core/facets.test.ts` → 9 passed; `[perf] 1000-note faceted search: 42.4 ms` (gate: <500 ms)
- `npx vitest run src/renderer/src/views/search/palette-nav.test.ts` → 8 passed
- `npm run build` green

### Completion Notes List

- Full-text = lib `searchVault` via `engine.search(q, 50)` (limit widened from the lib's default 10 so facet narrowing has material — recorded decision); facets narrow app-side in `src/core/facets.ts`.
- project/topic/status ride the `SearchHit` itself; type/from/to lazily parse hit frontmatter through an mtime-keyed memo (`memoizedMeta`) — mtime keying self-invalidates on file change, and the manual refresh (`vault.tree`) clears the cache outright, which is the v0.1 stand-in for story 2.3's `vault.changed` hook (no watcher in v0.1 — scope cut).
- Facet vocabulary: new app-local `vault.facets` channel aggregates projects (tree segments + handoff from/to) and topic/type/status values from the vault as-is — nothing hardcoded.
- Palette: generic keyboard-first command list (`palette-nav.ts` pure helpers unit-tested; search is the first item provider, recents the empty-query provider). Recents tracked by subscribing to reader selections. Overlay on `--bg-raised`, ink selection rail, mono footer hints — DESIGN.md tokens.
- Both surfaces share one zustand store (`stores/search.ts`): 150 ms debounce on keystrokes, immediate re-query on facet flips, stale-response guard (seq).
- Perf on generated 1,000-note vault: 42.4 ms for search + facet narrowing (memo cold), 12× under the 500 ms AC.

### File List

- `src/core/facets.ts` (new), `src/core/facets.test.ts` (new)
- `src/core/engine.ts` (`search(q, limit)`, `noteMeta`)
- `src/core/handlers.ts` (`vault.search` facets, `vault.facets`, cache clear on refresh)
- `src/shared/types.ts` (`Facets` extended, `FacetValues`), `src/shared/ipc-contract.ts` (`vault.facets`)
- `src/renderer/src/stores/search.ts` (new)
- `src/renderer/src/views/search/SearchView.tsx`, `Palette.tsx`, `palette-nav.ts`, `palette-nav.test.ts` (new)
- `src/renderer/src/App.tsx` (Search nav, Cmd+K listener, palette mount), `src/renderer/src/stores/app.ts` (view union), `styles.css` (search + palette blocks)

## QA Results

**Verdict: PASS** — Evidence base (QA pass 2026-07-10, fresh-eyes BMAD QA agent): app vitest 118/118 (23 files), lib vitest 115/115, `npm run typecheck` clean, `npm run build` clean, time-boxed `npm run dev` smoke (alive 3+ min, clean exit), and an M1-DoD driver that exercised the core-host modules directly against the real nimbus simulation vault (tree/readNote/resolveLink/search/handoffs/homeBrief/syncStatus/activity).

- AC1: code-verified — SearchView and the Cmd+K palette share one zustand store querying `vault.search`; global ⌘K handler in `App.tsx`.
- AC2: verified — full text from lib `searchVault` (M1 driver: 10 real hits); facet narrowing unit-tested (`facets.test.ts`).
- AC3: code-verified — title/project/snippet rows, Enter opens in reader (`palette-nav.test.ts` covers keyboard flow).
- AC4: verified — 42.4 ms search+narrow on a generated 1,000-note vault (in-repo perf test), 12× under the 500 ms budget.
