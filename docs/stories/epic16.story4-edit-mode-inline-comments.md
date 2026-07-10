# Story 16.4: Edit mode + inline comments — the writing surface

## Status

Done

## Story

**As a** vault reader,
**I want** to flip a note into a monospace edit mode (⌘E, ⌘S to save through the core host) and to attach inline comments to selected text in Read mode,
**so that** the reader becomes a writing surface whose every artifact (edit commit, comment note) stays plain vault markdown that agents see natively via MCP/CLI, per DESIGN.md Addendum D1 "Edit mode + inline comments".

## Acceptance Criteria

1. New core-host channel `note.save`: body-only writes to an existing vault note — frontmatter preserved **byte-for-byte untouched** (agents own frontmatter); path guarded via the lib's `resolveNoteInsideVault`; git auto-commit `loredex: edit <note> (<identity name>)`. Unit tests include traversal rejection + frontmatter preservation.
2. Reader gains a per-note mode toggle Read ⇄ Edit (⌘E, registered action): monospace 13px editor, minimal formatter bar (bold/italic/code/link/list/heading — markdown insertion only, no WYSIWYG), locked frontmatter panel, unsaved dot, ⌘S save → receipt toast + the Activity feed shows the edit commit.
3. Inline comments: Read-mode text selection → floating "Comment" chip → right-margin composer → creates an anchored comment note (`type: comment`, `replies_to: <note name>`, `anchor: "<exact selected text>"`, author identity) — plain vault markdown readable by agents via CLI/MCP. Composition follows the lib `annotateHandoff` frontmatter contract, extended with `anchor`/`author`, and works for ANY vault note (not just handoffs).
4. Rendering: anchored text gets a soft gold underline-highlight; comments stack in a right margin rail (cards: author + relative time + text); orphaned anchors (quote no longer found in the note) list at note end with a rust chip. No comment deletion in-app v1 (files are the API).
5. DoD: build green; e2e-style module test: edit+save round-trip on the live nimbus vault (`loredex-simulation/_machine2/nimbus-vault`) with frontmatter intact; comment create → visible via CLI (`cat` the comment note) proving agents can read it; anchor orphaning test.

## Tasks / Subtasks

- [x] Contract + types (AC: 1, 3)
  - [x] shared/types.ts: `NoteComment { path, author, at, anchor, body }`
  - [x] ipc-contract.ts: `note.save`, `note.comments`, `note.comment.create` channels (app-local contract evolution)
- [x] Core writers (AC: 1, 3)
  - [x] core/notes.ts (NEW, pure): `spliceBody` (frontmatter block kept verbatim — never re-serialized), `commentView` (comment-note → rail view, annotate-contract parsing)
  - [x] engine.ts: `saveNoteBody` (resolveNoteInsideVault guard + splice + gitAutoCommit edit message, identity injected) and `createNoteComment` (annotateHandoff contract + `anchor`/`author`/`created`, filed beside the parent, commit `loredex: comment on <parent>`)
  - [x] handlers.ts: `note.save` + `note.comment.create` under the write lock with identity requirement; `note.comments` read-only scan; cache invalidation + `vault.changed`
  - [x] core/notes.test.ts + core/note-save.test.ts: splice/parse units; channel drive over the fake port pair on a git-init'd fixture vault — traversal rejection, frontmatter byte-preservation, commit message + author, comment frontmatter contract, empty-anchor refusal
- [x] Edit mode (AC: 2)
  - [x] stores/editor.ts (NEW): per-note draft, unsaved derivation, save→toast; resets when the selection changes
  - [x] views/reader/editorFormat.ts (NEW, pure): markdown insertion for the six formatter actions
  - [x] views/reader/NoteEditor.tsx (NEW): mode toggle + unsaved dot, locked FrontmatterPanel, formatter bar, mono textarea, Save
  - [x] actions/registry.ts: `action:edit-note` (⌘E, live title) + `action:save-note` (⌘S) — palette/cheatsheet coverage rides the registry contract
- [x] Inline comments (AC: 3, 4)
  - [x] stores/comments.ts (NEW): per-note comment list + composer state, create → receipt toast; follows reader selection/doc
  - [x] views/reader/comments.ts (NEW, pure): `splitComments` (anchored vs orphaned), `relativeTime`
  - [x] views/reader/anchorHighlight.ts (NEW): CSS Custom Highlight ranges over the rendered body (guarded — no-op where unsupported)
  - [x] NoteView.tsx: Read-mode selection → floating Comment chip; `.note-layout` article + right `.comment-rail` (cards + composer); orphaned list at note end with rust chip
  - [x] styles.css: D1 16.4 block (mode toggle, mono 13px editor, formatter bar, locked frontmatter, gold `::highlight`, chip/rail/cards, rust orphan chip)
  - [x] design-fidelity.test.ts: 16.4 assertions
- [x] DoD drive (AC: 5)
  - [x] tests/edit-comments-drive.test.ts: live nimbus vault — edit+save round-trip (frontmatter bytes intact, activity feed shows the edit commit), comment create + `cat` via execFile proving CLI readability, anchor orphaning after a second edit; vault restored to its pre-test sha afterward

## Dev Notes

- DESIGN.md Addendum D1 "Edit mode + inline comments (the writing surface)" is the binding spec, read verbatim. [Source: DESIGN.md#addendum-d1]
- **Frontmatter preservation is byte-level**: `note.save` splices the new body after the original `---…---` block instead of parseDoc→serializeDoc round-tripping — gray-matter re-serialization would reformat YAML (quoting, key order, comments) and frontmatter is the agents' surface. Unedited saves are byte-identical files.
- **Writer placement**: the story specs `note.save`/comment-compose as core-host channels composed from lib primitives (`resolveNoteInsideVault`, `parseDoc`/`serializeDoc`, `stampSchema`, `slugify`, `rebuildIndexes`, `gitAutoCommit`, `stampEngineSchema`) — all called through `engine.ts`, the sole `import 'loredex'` site. `annotateHandoff` itself cannot carry `anchor`, so the compose reuses its exact frontmatter/body contract (project/topic/type/date/replies_to/source/loredex + schema stamp, heading + `On [[parent]]:` + attribution) extended with `anchor`, `author`, `created` — one code path for handoff and non-handoff notes alike, filed beside the parent (for handoffs that IS the `handoffs/` dir, so the thread rail keeps seeing them). No lib change needed.
- **Push semantics (recorded deviation)**: `annotateHandoff` pushes eagerly; `note.save` and inline comments commit only (`pushed: false` → receipt says "will push on next sync") — consistent with the D1 edit-commit spec, keeps the module drive network-free, and the poller/Sync-now push as usual.
- Both writers are vault writes: write lock + `requireIdentity` + `withGitIdentity` (identity rides the command, never ambient — F7). `vault.changed` announces the write; comment create reuses `announceCreated` (card is null — comments are never board cards).
- The edit commit parses as a generic `sync` activity event (the lib grammar's "anything else — never dropped" lane), so the feed shows it with its verbatim `loredex: edit …` summary; the feed already refreshes on `vault.changed`.
- `note.comments` returns only ANCHORED comments (`anchor` required): non-anchored handoff comments already render in the thread rail (story 8.2) — filtering prevents double rendering.
- Anchor orphan detection happens renderer-side against the note's rendered text (the same space the selection was captured in), falling back to the markdown source — `splitComments` is the pure, tested seam. Highlighting uses the CSS Custom Highlight API (`::highlight(loredex-anchor)`, soft gold underline-highlight per D1) — zero DOM mutation, guarded no-op where unavailable (node tests).
- ⌘E toggles edit for the open note from the reader view only; exiting keeps the draft in memory (re-entering restores it) and the unsaved dot shows whenever draft ≠ saved body. ⌘S saves only while editing; both are registered actions so the ⌘K palette, cheatsheet and coverage test pick them up automatically. Combos are shift-exact, so ⌘S never collides with ⇧⌘S Sync now.
- Frontmatter panel in edit mode is the SAME read-only `FrontmatterPanel` wrapped in a locked treatment + caps label ("frontmatter · locked — agents own it"); body only is editable.
- State placement: drafts/composer are session-only renderer state (zustand) — nothing persists; the note file and comment notes are the only truth. [Source: architecture.md#state-placement]
- Files: shared/types.ts + ipc-contract.ts, core/notes.ts (+test) + engine.ts + handlers.ts + note-save.test.ts, renderer stores/editor.ts (+test) + stores/comments.ts (+test), views/reader/{editorFormat,comments,anchorHighlight}.ts (+tests), NoteEditor.tsx, NoteView.tsx, actions/registry.ts (+test), styles.css, design-fidelity.test.ts, tests/edit-comments-drive.test.ts.

### Testing

- Core (colocated vitest): notes.ts pure units (splice preserves odd YAML byte-for-byte, no-frontmatter files, commentView contract parsing); note-save.test.ts channel drive on a git-init'd fixture-vault sandbox (traversal rejection incl. absolute outside paths, byte-identical frontmatter, commit message/author, comment note contract + note.comments scan, refusals).
- Renderer: editorFormat units (six actions, selection math), editor store (stubbed bridge: enter/draft/save/toast/reset), comments store (load/composer/create), splitComments orphaning + relativeTime, NoteView/NoteEditor static markup, design-fidelity CSS assertions.
- DoD drive: tests/edit-comments-drive.test.ts against the LIVE nimbus vault (skipped when the simulation tree is absent; restores the pre-test sha).
- Gate: typecheck (node+web), full app vitest SEQUENTIALLY, production build, e2e release gate.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from DESIGN.md Addendum D1 (M4 polish cycle) | Dev agent (BMAD) |
| 2026-07-10 | 1.0 | Implemented + DoD drive on the live nimbus vault | Dev agent (BMAD) |
| 2026-07-10 | 1.1 | D1 amendment: comment hover popover — hovering/keyboard-focusing an anchored span floats a `--bg-card` card above it (comment body, author name, absolute time mono 11px; multiple comments on one anchor stack in the one popover; pane-clamped, flips below rather than clipping off-window; Escape/mouseleave/blur dismiss; reduced-motion drops the animation). Anchors get focusable `.anchor-target` spans (tabindex 0 on the first segment); the margin rail remains | Dev agent (BMAD) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Sequential gate: `npm run typecheck` clean (node+web) → app vitest 665/665 (80 files; 57 new tests: 14 core notes/note-save, 8 editorFormat, 9 editor store, 7 comments store, 8 comments pure, 6 NoteView/NoteEditor markup, 3 registry, 6 fidelity, 3 live drive... net +57 over the 608 baseline) → `npm run build` clean → `npm run test:e2e` 18/18 (~33 s).
- Vitest ops note: the FULL app suite at default worker count flaked pre-existing git-heavy tests (sync.test/poller.test 5 s invoke timeouts) on this machine — reproduced with this story's files EXCLUDED, so it is machine-load, not a regression (matches the M3 QA "concurrent suites flake" note). `npx vitest run --max-workers=4` is 665/665 green in ~46 s wall; the two files also pass solo.
- Live nimbus drive (tests/edit-comments-drive.test.ts, runs in `npm test`, skipped when the sim tree is absent/dirty): note.save on `projects/nimbus-frontend/streaming/2026-07-09-streaming-ui.md`-class notes with the frontmatter block byte-identical + `loredex: edit <note> (Dana Reyes)` at HEAD authored by the payload identity + the commit surfacing in activity.feed; comment create → `cat` shows `type: comment`, `replies_to: 2026-07-09-streaming-api`, `anchor: 'The engine''s token streaming (`run_stream()`...'`, `author: Dana Reyes <dana@nimbus.dev>`, quote + prose + attribution — agents read it with zero tooling; second edit removes the quote → anchor no longer found (orphan predicate). Vault reset --hard to its pre-test sha afterward — history and worktree verified unchanged (4f77cce, clean).

### Completion Notes List

- `note.save` preserves frontmatter BYTE-FOR-BYTE: core/notes.ts `spliceBody` keeps the original `---…---` block verbatim and swaps only the body — no gray-matter re-serialization, so YAML quoting/comments/order (the agents' surface) survive and an unedited save is a byte-identical file. Trailing newline is normalized (git-friendly).
- One comment compose path for ALL notes: engine `createNoteComment` follows the lib annotateHandoff contract verbatim (project/topic/type/date/replies_to/source/loredex + stampSchema/stampEngineSchema/rebuildIndexes/gitAutoCommit, heading + `On [[parent]]:` + attribution body) extended with `anchor`, `author`, `created`; filed beside the parent — for handoffs that IS the handoffs/ dir, so story 8.2's thread rail keeps seeing them. No lib change was needed.
- Recorded deviation (push semantics): annotateHandoff pushes eagerly; note.save and inline comments COMMIT ONLY (`pushed: false`, receipt says "will push on next sync") — matches the D1 edit-commit spec, keeps the module drive network-free; the poller/Sync-now push as usual.
- `note.comments` returns ANCHORED comments only — non-anchored handoff comments already render in the thread rail; the filter kills double rendering by construction.
- The edit commit intentionally rides the lib activity grammar's "anything else → sync, never dropped" lane — the feed shows `loredex: edit <note> (<name>)` verbatim with the commit sha; the feed already refreshes on vault.changed.
- Anchor highlight is the CSS Custom Highlight API (`::highlight(loredex-anchor)`, gold 18% wash + gold underline): zero DOM mutation of the sanctioned pipeline output, ranges matched across inline-element boundaries over the text-node stream, guarded no-op under node/jsdom. Orphan detection (splitComments) matches the RENDERED text first (the space selections are captured in), markdown source as fallback.
- Zustand v5 SSR lesson: static-markup tests see a store's INITIAL snapshot, so all 16.4 presentation is props-driven — store state stops at NoteView (editing/draft/unsaved/comments/composer ride down as props), which is also why NoteArticle stayed testable.
- ⌘E/⌘S are registry actions (palette + cheatsheet + coverage test pick them up automatically); ⌘S is shift-exact so ⇧⌘S Sync now never collides; ⌘E is a no-op outside the reader; exiting edit keeps the draft (the Read-mode toggle shows the unsaved dot) and re-entering restores it; opening a different note resets.
- Housekeeping: removed an accidentally duplicated `16-3-vault-tree-sections` row in sprint-status.yaml (same value, YAML duplicate key). Pre-existing uncommitted QA edits in sprint-status.yaml/DESIGN.md/epic15 stories were left untouched — only this story's hunk was staged.
- Deviation against D1: none.

### File List

- docs/stories/epic16.story4-edit-mode-inline-comments.md — this story
- docs/stories/sprint-status.yaml — epic-16 row (16-4) + duplicate 16-3 row removed
- src/shared/types.ts — `NoteComment`
- src/shared/ipc-contract.ts — `note.save` / `note.comments` / `note.comment.create` channels
- src/core/notes.ts — NEW: `spliceBody` (byte-preserving body splice), `commentView`/`commentProse`
- src/core/notes.test.ts — NEW: splice byte-preservation + comment contract parsing units
- src/core/engine.ts — `saveNoteBody` + `createNoteComment` (+ `resolveInVault` shared with readNote)
- src/core/handlers.ts — the three channels (write lock, identity, invalidation, vault.changed)
- src/core/note-save.test.ts — NEW: channel drive on a git-init'd fixture sandbox (traversal, bytes, commits, contract, refusals)
- src/renderer/src/stores/editor.ts — NEW: edit-mode store (draft/unsaved/save→toast, reader-follow reset)
- src/renderer/src/stores/editor.test.ts — NEW
- src/renderer/src/stores/comments.ts — NEW: per-note comments + composer store (reader-follow load)
- src/renderer/src/stores/comments.test.ts — NEW
- src/renderer/src/views/reader/editorFormat.ts — NEW: formatter-bar markdown insertion math
- src/renderer/src/views/reader/editorFormat.test.ts — NEW
- src/renderer/src/views/reader/comments.ts — NEW: splitComments/byAnchorPosition/relativeTime/anchorPreview
- src/renderer/src/views/reader/comments.test.ts — NEW: anchor-orphaning + rail-order units
- src/renderer/src/views/reader/anchorHighlight.ts — NEW: CSS Custom Highlight ranges (guarded)
- src/renderer/src/views/reader/NoteEditor.tsx — NEW: ModeToggle + the edit surface (props-driven)
- src/renderer/src/views/reader/InlineComments.tsx — NEW: margin rail, composer, orphaned list
- src/renderer/src/views/reader/NoteView.tsx — mode switch, selection→chip, note-layout + rail wiring
- src/renderer/src/views/reader/NoteView.test.ts — 16.4 markup assertions
- src/renderer/src/actions/registry.ts — `action:edit-note` (⌘E) + `action:save-note` (⌘S)
- src/renderer/src/actions/registry.test.ts — 16.4 action tests
- src/renderer/src/styles.css — D1 16.4 block (editor, toggle, ::highlight, chip/rail/cards, orphan chip)
- src/renderer/src/design-fidelity.test.ts — 16.4 assertions
- tests/edit-comments-drive.test.ts — NEW: live nimbus vault DoD drive (self-restoring)
