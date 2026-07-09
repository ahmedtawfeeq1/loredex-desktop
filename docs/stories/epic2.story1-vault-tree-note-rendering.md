# Story 2.1: Vault tree & note rendering

## Status

Approved

## Story

**As a** reader,
**I want** a vault file tree and fully rendered notes,
**so that** I can browse the vault without a terminal or Obsidian.

## Acceptance Criteria

1. A sidebar shows the vault's markdown files as a collapsible folder tree; `.git/**` and dotfiles are hidden.
2. Selecting a note renders GFM markdown through the sanctioned unified pipeline, sanitized, with the frontmatter shown as a metadata panel.
3. Rendering is strictly read-only — no edit affordances.
4. Notes up to 1 MB render without freezing the UI.

## Tasks / Subtasks

- [ ] Vault tree data (AC: 1)
  - [ ] Add a core-host handler for listing the vault's markdown tree (extend `vault.search`? No — add a read-only listing inside the existing `config.get`/reader flow: implement as a core-host walk rooted at the vault path, exposed via a new contract channel `vault.tree` added to `src/shared/ipc-contract.ts` with `{ in: void; out: TreeNode[] }`, `TreeNode` app-local in `shared/types.ts`)
  - [ ] Exclude `.git/**`, dotfiles/dotfolders, non-markdown files
- [ ] Tree UI (AC: 1)
  - [ ] `views/reader/VaultTree.tsx`: collapsible folders, current-note highlight, zustand store for selection
- [ ] Note view (AC: 2, 3, 4)
  - [ ] Promote Story 1.4's `NoteView.tsx`: frontmatter metadata panel (table of key/values) + body via `src/renderer/src/markdown/` pipeline
  - [ ] No contentEditable, no edit buttons anywhere
  - [ ] Perf: memoize the rendered tree per note content hash; render a 1 MB fixture note without blocking (use `startTransition`/chunked render if needed)

## Dev Notes

- The unified pipeline from Story 1.4 (`remark-parse → remark-gfm → remark-rehype → rehype-sanitize → rehype-react`) is the only sanctioned markdown path — extend it, never bypass it. [Source: architecture.md#tech-stack] [Source: architecture.md#coding-standards]
- New contract channel: adding `vault.tree` is legitimate contract evolution — add it to `ipc-contract.ts` (one seam), register in `src/core/ipc.ts`, and keep the walk read-only inside the core host. Renderer never touches `fs`. [Source: architecture.md#ipc-contract] [Source: architecture.md#coding-standards]
- Tree walking is read-only view logic, so app-side implementation is permitted (anti-second-engine rule only fences vault WRITES). [Source: architecture.md#overview]
- Note reads keep going through `vault.readNote` → `resolveNoteInsideVault` + `parseDoc` (Story 1.3); the tree supplies paths, the handler enforces safety. [Source: architecture.md#loredex-library-surface]
- No editing is a v1 product cut, not a TODO — do not scaffold editor hooks.
- Live refresh of the tree arrives with Story 2.3 (`vault.changed`); design the tree store with an `invalidate()` so 2.3 plugs in cleanly.
- Files: `src/shared/ipc-contract.ts` (+`vault.tree`), `src/shared/types.ts` (`TreeNode`), `src/core/ipc.ts`, `src/core/engine.ts` (vault path accessor), `src/renderer/src/views/reader/VaultTree.tsx`, `NoteView.tsx`, `src/renderer/src/stores/reader.ts`. [Source: architecture.md#source-tree]

### Testing

- Unit: tree walk excludes `.git`/dotfiles; metadata panel renders frontmatter types (strings, arrays, dates); sanitizer strips script content. Perf check with a generated 1 MB note fixture. [Source: architecture.md#testing-strategy]

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
