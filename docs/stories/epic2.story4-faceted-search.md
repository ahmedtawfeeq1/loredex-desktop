# Story 2.4: Faceted full-text search

## Status

Approved

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

- [ ] Core-side facets (AC: 2)
  - [ ] Define `Facets` in `src/shared/types.ts`: `{ project?, topic?, type?, status?, from?, to? }`
  - [ ] Extend the `vault.search` handler: run `searchVault(q)`, then filter hits by frontmatter facets (parse via `parseDoc` on hit paths, memoized per mtime)
- [ ] Search view (AC: 1, 3)
  - [ ] `views/search/SearchView.tsx`: query input + facet dropdowns (values aggregated from vault frontmatter via a small `vault.facetValues`-style aggregation — implement inside the existing `vault.search` handler family or a memoized core-side aggregate exposed on the search response), result list with title/project/highlighted snippet, Enter/click → reader
- [ ] Cmd+K palette (AC: 1, 3)
  - [ ] `views/search/Palette.tsx`: global Cmd+K overlay, same `vault.search` backend, keyboard-first (arrows + Enter), recent-notes fallback when the query is empty
- [ ] Performance (AC: 4)
  - [ ] Debounce input (150 ms); memoize frontmatter parses; measure against a generated 1,000-note fixture and record the number in the story's Completion Notes

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

### Debug Log References

### Completion Notes List

### File List

## QA Results
