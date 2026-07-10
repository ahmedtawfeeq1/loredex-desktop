# Story 11.2: Contract timeline UI & unified diff viewer

## Status

Done

## Story

**As an** integrations engineer,
**I want** a rendered timeline of contract changes with a click-through diff,
**so that** "what changed in the API and when" needs no terminal.

## Acceptance Criteria

1. A Contracts view renders `contracts.timeline` per the DESIGN v2 spec: vertical rail, mono dates, one card per change — file path (mono), +/- counts (`--ok` / rust), commit hash (mono), author; filterable by project.
2. Clicking a change opens the diff: `contracts.diff {repoRoot, file, sha}` renders unified format on `--bg-inset` ground, additions `--ok` tint, deletions rust tint, mono 12px, inside its own horizontally-scrolling container.
3. The 200 KB size cap is honored: `truncated: true` renders a visible "diff truncated" notice with the commit hash to inspect externally — never a silent cut.
4. The view refreshes on `contract.changed` events; empty states: no roots configured → one serif sentence + "Choose project folders…" action into Settings; roots but no matches → plain statement.
5. Linked-handoff chips on timeline cards render when Story 11.3 supplies `links` (component slot built now, populated later); both themes + keyboard per the quality floor.

## Tasks / Subtasks

- [x] Timeline view (AC: 1, 4)
  - [x] `views/contracts/ContractTimeline.tsx`: vertical rail + change cards from `contracts.timeline`; project filter; `contract.changed` subscription; empty states
- [x] Diff viewer (AC: 2, 3)
  - [x] `contracts.diff` channel registration (core: `git show <sha> -- <file>`, 200 KB cap → truncated flag); `DiffView.tsx` unified renderer (line-class by prefix, no diff lib needed) in an `overflow-x: auto` card
- [x] Chip slot (AC: 5)
  - [x] `links: {handoffId, confidence}[]` slot on the change card; renders nothing when empty
- [x] Tests

## Dev Notes

- Diff extraction pins to commits only — `git show <sha> -- <file>`, never `git diff` against the worktree; the cap and truncated flag are contract, not suggestion. [Source: architecture-m2.md#5-contract-intelligence]
- Channel: `contracts.diff {repoRoot, file, sha}` → `{unified: string, truncated: boolean}` (derived). [Source: architecture-m2.md#8-ipc-additions]
- Timeline + diff visuals are specified exactly (rail, mono dates, +/- counts, inset ground, ok/rust tints, mono 12px) — implement the spec. [Source: DESIGN.md#data-visualizations-dependency-graph-contract-timeline]
- Depends on Story 11.1 (timeline channel + scan). Commit-hash chips become links via Story 12.1's helper — render plain mono until then.
- Files: `src/renderer/src/views/contracts/ContractTimeline.tsx`, `DiffView.tsx`, `src/core/contracts.ts` (diff), `src/shared/ipc-contract.ts`, `src/core/ipc.ts`, sidebar/⌘K entries.

### Testing

- Unit: unified-diff line classification, truncated-notice rendering, empty-state matrix, filter behavior. Integration: fixture repo diff round-trip incl. a >200 KB change asserting truncation. [Source: architecture-m2.md#5-contract-intelligence]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from architecture-m2.md (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- `npx vitest run src/core/contracts.test.ts src/renderer/src/views/contracts/diff-logic.test.ts` — 27/27 (line classification incl. `+++`/`---` as meta, empty-state matrix, filter, cap/truncation on a >200 KB fixture change, sha guard)
- Live-fixture driver (temp vitest file, removed after): nimbus-backend timeline shows the real openapi.yaml series (cfde836 → f3a398e → 839fd5d → 97d4b73, +8/+25/+58/+73 adds) plus postman_collection.json rows; `git show 97d4b73 -- openapi.yaml` diff renders untruncated
- `npm test` — 389/389; `npm run build` — typecheck + electron-vite clean

### Completion Notes List

- Diff pinning is enforced twice: `diffArgs` is exactly `show <sha> -- <file>`, and the handler rejects any repoRoot not in the registered roots plus any non-hex "sha" (`isCommitSha`, 7–40 word-bounded) — git only runs where the user pointed the app, with commit args only.
- 200 KB cap cuts at a whole-line boundary (also drops split multi-byte chars); the renderer shows a rust "Diff truncated" notice with the hash — AC3's never-silent rule.
- Project filter is client-side over the full timeline so tabs never vanish while filtered; switcher reuses the board-tab pattern.
- Commit hashes render plain mono for now — story 12.1's helper makes them links (dev note honored).
- Empty-state matrix: no roots → serif sentence + "Choose project folders…" into Settings; roots without matches → plain statement; per-project empty → honest sentence.
- Chip slot (`LinkChips`) renders nothing on empty `links`; tier styling (solid gold mentioned / dashed `--text-2` + explicit HEURISTIC label) shipped now so 11.3 only feeds data.
- Nav: sidebar "Contracts" entry + ⌘K "Contract timeline" action; store resets on vault change like every view store.

### File List

- `src/renderer/src/views/contracts/ContractTimeline.tsx`, `DiffView.tsx`, `diff-logic.ts`, `diff-logic.test.ts` (new)
- `src/renderer/src/stores/contracts.ts` (new)
- `src/core/contracts.ts` (capDiff, diffArgs, isCommitSha), `src/core/contracts.test.ts`
- `src/core/handlers.ts` (contracts.diff), `src/shared/ipc-contract.ts` (channel)
- `src/renderer/src/App.tsx`, `src/renderer/src/stores/app.ts`, `src/renderer/src/views/search/Palette.tsx` (nav + ⌘K)
- `src/renderer/src/styles.css` (timeline rail, change cards, chips, diff viewer)

## QA Results
