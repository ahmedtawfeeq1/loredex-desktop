# Story 11.2: Contract timeline UI & unified diff viewer

## Status

Approved

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

- [ ] Timeline view (AC: 1, 4)
  - [ ] `views/contracts/ContractTimeline.tsx`: vertical rail + change cards from `contracts.timeline`; project filter; `contract.changed` subscription; empty states
- [ ] Diff viewer (AC: 2, 3)
  - [ ] `contracts.diff` channel registration (core: `git show <sha> -- <file>`, 200 KB cap → truncated flag); `DiffView.tsx` unified renderer (line-class by prefix, no diff lib needed) in an `overflow-x: auto` card
- [ ] Chip slot (AC: 5)
  - [ ] `links: {handoffId, confidence}[]` slot on the change card; renders nothing when empty
- [ ] Tests

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

### Debug Log References

### Completion Notes List

### File List

## QA Results
