# Story 2.2: Wikilink resolution & diagnostics

## Status

Done

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

- [x] Resolution engine (AC: 1, 2)
  - [x] `src/core/links.ts`: index vault note basenames/paths (from the Story 2.1 walk); implement Obsidian shortest-path resolution — exact path match, then unique basename, then shortest distinguishing suffix; return `LinkResolution` = `{ status: 'resolved'|'ambiguous'|'broken', target?, candidates?: {path, project}[] }`
  - [x] Register `vault.resolveLink` handler (`{link, from}` → `LinkResolution`)
  - [x] Rebuild the link index on `vault.changed` (hook point for Story 2.3; until then, on demand)
- [x] Renderer wikilink plugin (AC: 1, 2, 4)
  - [x] Remark plugin in `src/renderer/src/markdown/wikilinks.ts`: parse `[[target]]` and `[[target|alias]]` into link nodes carrying the raw target
  - [x] `WikiLink.tsx` component: resolves via `invoke('vault.resolveLink')` (batched per note render); resolved → navigates the reader; ambiguous → popover picker showing candidates with project context; broken → diagnostic style (dashed underline + warning color), click opens the diagnostics panel — NEVER creates a file
- [x] Hover previews (AC: 3)
  - [x] On hover (debounced), `invoke('vault.readNote')` on the target; render the first ~20 lines through the markdown pipeline in a popover; cache per session
- [x] Diagnostics list (AC: 4)
  - [x] `views/reader/Diagnostics.tsx`: broken links found in the current note (and a per-vault list fed lazily as notes render)
- [x] Tests (AC: 5)

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

Claude Fable 5 (claude-fable-5), BMAD dev agent, 2026-07-10.

### Debug Log References

- `npm run typecheck` clean; `npm test` 43/43; `npm run build` green.
- Time-boxed `npm run dev` smoke against the nimbus simulation vault: core host logged `config: …/loredex-simulation/_machine2/nimbus-vault` (persisted `--vault` override at fork).

### Completion Notes List

- Resolution engine in `src/core/links.ts` (core host, one index for all views): exact vault-relative path match first, then case-insensitive path-suffix match — unique basename is the one-segment suffix case, longer suffixes are the shortest-distinguishing-suffix disambiguation. `./`/`../` links resolve against the linking note's folder. `|alias` and `#heading` parts tolerated. Index built from the story-2.1 `listMarkdownFiles` walk, cached per vault, invalidated by `vault.tree` (the manual refresh) — the `vault.changed` hook point for story 2.3.
- `LinkResolution` reshaped in `shared/types.ts` to this story's contract (`status`/`target`/`candidates{path,project}`), replacing the 1.2-era stub.
- Batching: `resolveCached` dedupes to ONE `vault.resolveLink` per unique target per note (session cache, settled values readable synchronously so re-renders don't flicker); hover previews cache `vault.readNote` per target and render the first 20 lines through the sanctioned pipeline (350 ms debounce).
- Ambiguous → in-place popover picker listing candidates with project context (never a silent guess); broken → rust dotted underline + diagnostic tooltip, click opens the diagnostics panel; nothing anywhere creates a file. Diagnostics panel: current note first, per-vault list fed lazily as notes render, sticky rust count pill in the reader.
- **Deviation (minor):** DESIGN.md specifies broken links as "rust dotted-underline" — implemented as specified (the story's "dashed underline" phrasing lost to the binding design system). External (non-wiki) anchors render via the same `MarkdownAnchor` and open in the default browser through the main-process navigation guard.
- Fixtures added to `tests/fixtures/vault`: same-basename `2026-07-07 - meeting-notes.md` under nimbus-api and nimbus-web (collision) + `2026-07-08 - nimbus-web - crosslinks.md` (unique, aliased, colliding and broken wikilinks).

### File List

- `src/shared/types.ts` (`LinkResolution`/`LinkCandidate`)
- `src/core/links.ts` (new) + `links.test.ts`, `src/core/handlers.ts` (register + index invalidation)
- `src/renderer/src/markdown/wikilinks.ts` (new) + `wikilinks.test.ts`, `markdown/resolveCache.ts` (new), `markdown/pipeline.ts` (plugin + anchor component)
- `src/renderer/src/components/WikiLink.tsx` (new), `src/renderer/src/views/reader/Diagnostics.tsx` (new), `src/renderer/src/stores/diagnostics.ts` (new), `src/renderer/src/stores/reader.ts` (cache/diagnostics lifecycle), `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`
- `tests/fixtures/vault/projects/nimbus-api/meetings/2026-07-07 - meeting-notes.md`, `tests/fixtures/vault/projects/nimbus-web/meetings/2026-07-07 - meeting-notes.md`, `tests/fixtures/vault/projects/nimbus-web/2026-07-08 - nimbus-web - crosslinks.md` (new fixtures)

## QA Results
