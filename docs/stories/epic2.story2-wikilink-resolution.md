# Story 2.2: Wikilink resolution & diagnostics

## Status

Approved

## Story

**As a** reader,
**I want** clickable, disambiguated wikilinks with hover previews,
**so that** link-following never requires filesystem archaeology (F9).

## Acceptance Criteria

1. `[[wikilinks]]` resolve via the Obsidian shortest-path algorithm implemented in the core host (`vault.resolveLink`).
2. Cross-project name collisions are disambiguated: an ambiguous link opens a picker listing candidates with project context.
3. Hovering a resolved link shows a preview excerpt of the target note.
4. Broken links render in a distinct diagnostic style and appear in a diagnostics list — never auto-created.
5. Unit tests cover resolution, collision, and broken-link cases.

## Tasks / Subtasks

- [ ] Resolution engine (AC: 1, 2)
  - [ ] `src/core/links.ts`: index vault note basenames/paths (from the Story 2.1 walk); implement Obsidian shortest-path resolution — exact path match, then unique basename, then shortest distinguishing suffix; return `LinkResolution` = `{ status: 'resolved'|'ambiguous'|'broken', target?, candidates?: {path, project}[] }`
  - [ ] Register `vault.resolveLink` handler (`{link, from}` → `LinkResolution`)
  - [ ] Rebuild the link index on `vault.changed` (hook point for Story 2.3; until then, on demand)
- [ ] Renderer wikilink plugin (AC: 1, 2, 4)
  - [ ] Remark plugin in `src/renderer/src/markdown/wikilinks.ts`: parse `[[target]]` and `[[target|alias]]` into link nodes carrying the raw target
  - [ ] `WikiLink.tsx` component: resolves via `invoke('vault.resolveLink')` (batched per note render); resolved → navigates the reader; ambiguous → popover picker showing candidates with project context; broken → diagnostic style (dashed underline + warning color), click opens the diagnostics panel — NEVER creates a file
- [ ] Hover previews (AC: 3)
  - [ ] On hover (debounced), `invoke('vault.readNote')` on the target; render the first ~20 lines through the markdown pipeline in a popover; cache per session
- [ ] Diagnostics list (AC: 4)
  - [ ] `views/reader/Diagnostics.tsx`: broken links found in the current note (and a per-vault list fed lazily as notes render)
- [ ] Tests (AC: 5)

## Dev Notes

- `vault.resolveLink` is contractually app-side read-only view logic — the one op the work-plan explicitly assigns to the app because it renders links and never touches files. Implement in the core host, not the renderer, so one index serves all views. [Source: architecture.md#ipc-contract] [Source: architecture.md#overview]
- `LinkResolution` is an app-local type in `src/shared/types.ts` — shape it now as above; it is not a loredex export. [Source: architecture.md#ipc-contract]
- Evidence constraints from the spec: vault-root links like `[[2026-07-09-handoff-nimbus-backend]]` can name two different handoffs in different project folders — ambiguity MUST surface a picker, never a silent guess. Broken links are diagnostics because agents also write the vault; auto-create is dangerous.
- Batch resolution: resolving N links with N invokes per note render is acceptable at M1 scale but batch into one `vault.resolveLink`-per-unique-target map per note to keep the seam chatty-clean.
- Reuse the fixture vault; add collision + broken-link fixtures to `tests/fixtures/vault/` (two notes with the same basename in different projects). [Source: architecture.md#testing-strategy]
- Files: `src/core/links.ts`, `src/core/ipc.ts` (register), `src/renderer/src/markdown/wikilinks.ts`, `src/renderer/src/components/WikiLink.tsx`, `src/renderer/src/views/reader/Diagnostics.tsx`. [Source: architecture.md#source-tree]

### Testing

- Unit (core): unique basename, nested path, shortest-suffix disambiguation, two-project collision → ambiguous with both candidates, missing target → broken. Unit (renderer): plugin parses `[[x]]` and `[[x|alias]]`; broken style applied. [Source: architecture.md#testing-strategy]

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
