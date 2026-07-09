# Story 2.1: Vault tree & note rendering

## Status

Done

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

- [x] Vault tree data (AC: 1)
  - [x] Add a core-host handler for listing the vault's markdown tree (extend `vault.search`? No — add a read-only listing inside the existing `config.get`/reader flow: implement as a core-host walk rooted at the vault path, exposed via a new contract channel `vault.tree` added to `src/shared/ipc-contract.ts` with `{ in: void; out: TreeNode[] }`, `TreeNode` app-local in `shared/types.ts`)
  - [x] Exclude `.git/**`, dotfiles/dotfolders, non-markdown files
- [x] Tree UI (AC: 1)
  - [x] `views/reader/VaultTree.tsx`: collapsible folders, current-note highlight, zustand store for selection
- [x] Note view (AC: 2, 3, 4)
  - [x] Promote Story 1.4's `NoteView.tsx`: frontmatter metadata panel (table of key/values) + body via `src/renderer/src/markdown/` pipeline
  - [x] No contentEditable, no edit buttons anywhere
  - [x] Perf: memoize the rendered tree per note content hash; render a 1 MB fixture note without blocking (use `startTransition`/chunked render if needed)

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

Claude Fable 5 (claude-fable-5), BMAD dev agent, 2026-07-10.

### Debug Log References

- `npm run typecheck` clean; `npm test` 30/30; `npm run build` green (see commit).

### Completion Notes List

- `vault.tree` contract channel added exactly as prescribed; walk lives in `src/core/tree.ts` (read-only, core-host side), skips dot-entries (`.git`, `.obsidian`, `.loredex`, dotfiles), non-markdown files and folders with no markdown below; dirs-first case-insensitive ordering. `listMarkdownFiles()` flattening is exported as the story-2.2 link-index input.
- Tree UI uses native `<details>` folders (keyboard support for free); selection per DESIGN.md = 4px Archive Ink left rail + `--bg-raised` fill. Reader-store `refresh()` is the invalidate seam for story 2.3; until the watcher lands it is wired to a visible Refresh action in the pane header (v0.1 scope cut: manual refresh instead of file watcher).
- Perf: rendered body memoized per `doc` (`useMemo`), `startTransition` on doc swap; 1 MB generated note renders through the full pipeline in well under the 5 s test budget (~0.5 s locally).
- **Deviation (minor):** tree rows are 26px single-line (name only, full path in tooltip) rather than the 38px title+metadata list-row spec — DESIGN's 38px rows describe contextual list panes (inbox etc.); a dense file tree with per-row metadata would be noise. Read-only: no edit affordances anywhere.

### File List

- `src/shared/types.ts` (`TreeNode`), `src/shared/ipc-contract.ts` (`vault.tree`)
- `src/core/tree.ts` (new) + `tree.test.ts`, `src/core/handlers.ts` (register)
- `src/renderer/src/stores/reader.ts` (tree + refresh/invalidate), `src/renderer/src/views/reader/VaultTree.tsx` (new), `NoteView.tsx` (exported panel), `NoteView.test.ts` (new), `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`

## QA Results
