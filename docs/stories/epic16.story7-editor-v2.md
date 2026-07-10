# Story 16.7: Editor v2 — CodeMirror 6 writing surface

## Status

Done

## Story

**As a** vault writer,
**I want** the note editor upgraded from the 16.4 plain textarea to CodeMirror 6 — markdown syntax highlighting in both themes, a selection-aware full toolbar, in-editor shortcuts, history, search, and a dirty-guard,
**so that** editing in Loredex feels like a real markdown editor (Obsidian's editor core, the standard) while every 16.4 semantic — locked frontmatter, `note.save`, receipts — stays byte-identical, per DESIGN.md D1 amendment 2 "editor v2".

## Acceptance Criteria

1. The edit surface is CodeMirror 6 (`@codemirror/*` + `@lezer/highlight`, MIT — sanctioned): markdown syntax highlighting (headings/bold/code/links tinted via theme tokens, BOTH themes), active-line highlight, bracket match, markdown-aware list continuation on Enter, history (undo/redo), search panel (⌘F), multiple selections.
2. Toolbar (28px icon buttons, hairline group borders, tooltips with shortcuts): headings dropdown H1–H4 · bold ⌘B · italic ⌘I · strikethrough · inline code · code block · wikilink `[[ ]]` · md link ⌘K-in-editor · quote · bullet list · numbered list · task list · table snippet · horizontal rule · undo/redo. All insert/wrap markdown, selection-aware — wrap the selection, toggle OFF when already applied.
3. Frontmatter stays locked (not part of the editable doc). Save semantics unchanged: ⌘S → `note.save`, receipt toast, activity commit. Dirty-guard on note/view switch (save/discard prompt) — unsaved work is never dropped silently.
4. Editor fills the pane full-bleed like Read mode; 13px mono; gutter line numbers OFF (notes, not code).
5. Existing edit-mode tests keep passing (adapted where textarea-specific); NEW: toolbar wrap/toggle unit tests (≥5 representative actions), dirty-guard tests, theme-token presence assertions for the highlight styles. typecheck + full vitest + build green.

## Tasks / Subtasks

- [x] Dependencies (AC: 1): `@codemirror/{state,view,language,commands,search,lang-markdown}` + `@lezer/highlight`, exact-pinned like every other dep
- [x] `views/reader/editorCommands.ts` (NEW, pure) (AC: 2, 5): toolbar action → `TransactionSpec` over `EditorState` — inline wrap/unwrap via `changeByRange` (multi-cursor aware), line-prefix toggles (quote/ul/ol/task), heading level set/replace/toggle, code-block fence/unfence, link with url-slot selection, table/hr block inserts; `actionCommand` adapter for keymaps; carries the 16.4 semantics forward (placeholder on empty selection, multi-line inline code → fence, idempotent line prefixes). Replaces `editorFormat.ts` (+test), which was textarea-specific
- [x] `views/reader/editorTheme.ts` (NEW) (AC: 1, 4): `HIGHLIGHT_TOKENS` (every syntax tint a styles.css `var(--token)` — themes flip via CSS vars, zero editor-side switching), `markdownHighlight` HighlightStyle, `editorChrome` EditorView.theme (13px, mono via `--font-mono`, token caret/selection/panels, full-bleed — no gutter), `EDITOR_V2_CSS` toolbar/host stylesheet mounted by NoteEditor in a scoped `<style>` (styles.css untouched — owned by a concurrently-committing workflow)
- [x] `views/reader/NoteEditor.tsx` (AC: 1–4): CM6 view per note seeded from the store draft (⌘E out/in restores), `updateListener` syncs every doc change into the editor store so unsaved/⌘S/dirty-guard ride the one draft; extensions: history, drawSelection + allowMultipleSelections, highlightActiveLine, bracketMatching, search (⌘F, top panel), lineWrapping, GFM markdown (`markdownLanguage`: tables/tasks/strikethrough), markdownKeymap (Enter list continuation, Backspace markup delete); `Prec.high` in-editor keymap ⌘B/⌘I/⌘K; a keydown listener on the host stops propagation of chords CM handled so the App-shell registry never double-fires (⌘K palette stays reachable outside the editor); headings `<select>` + 15 toolbar buttons (mousedown-preventDefault keeps the selection)
- [x] `stores/editor.ts` dirty-guard (AC: 3): note-switch AND reader-exit subscriptions route dirty drafts through a save/discard `confirm` prompt — OK saves via `note.save` (identity-less: draft kept + toast, work never lost), Cancel discards; clean drafts keep the exact 16.4 silent behavior; headless (no `confirm`) degrades to discard so node tests and the pre-16.7 contract hold
- [x] Tests (AC: 5): `editorCommands.test.ts` (19 — wrap/toggle/unwrap on selection for bold/italic/strike/code/wikilink/link/quote/ul/ol/task/h1–h4/codeblock/table/hr + multi-selection), `editorTheme.test.ts` (5 — every highlight tint is `var(--token)`, every token present in BOTH theme blocks of styles.css, HighlightStyle covers the spec surface, 28px buttons, no host border, no raw hex), `stores/editor.test.ts` +6 dirty-guard cases, `NoteView.test.ts` editor assertions adapted to the CM host + full toolbar
- [x] Per-file search (user request, 2026-07-10, rider): `views/reader/treeFilter.ts` (+4 tests) pure name filter; VaultTree gains a search input under the pane header (beside/below Refresh), matches force sections open, scoped styles

## Dev Notes

- DESIGN.md "D1 amendment 2 — editor v2" is the binding spec, read verbatim; the 16.4 "Edit mode + inline comments" section defines the preserved save/comment semantics. [Source: DESIGN.md#d1-amendment-2]
- **Theming strategy**: all editor color is expressed as CSS custom properties from styles.css tokens — `HighlightStyle`/`EditorView.theme` emit `var(--…)`, so the `[data-theme='dark']` flip themes the editor for free. `editorTheme.test.ts` asserts the token contract in both blocks so a token rename breaks loudly.
- **Scope discipline**: styles.css and App.tsx are owned by concurrently-committing workflows — story-16.7 styling ships from `editorTheme.ts` (CM themes + a component-scoped `<style>`), keyboard interplay is solved at the editor host (stopPropagation on handled chords), and no shell file moved. The 16.4 `.note-editor`/`.formatter-bar` rules in styles.css are now unreferenced — flagged for the next styles pass rather than touched here.
- **Draft flow unchanged**: the editor store stays the single draft owner; CM is a view over it. Store → CM only at mount (per-note); CM → store on every doc change. History lives in CM per edit session (a ⌘E round-trip restores the draft text, not the undo stack — textarea had neither).
- **Dirty-guard shape**: prompts ride `window.confirm` (Electron-native, synchronous) from the store subscriptions — the switch has already happened when a subscription fires, so the guard resolves the DRAFT (save/keep/discard), it does not block navigation. Known edge, recorded: OK-with-no-identity keeps the draft under its old path; entering edit on a DIFFERENT note afterwards replaces it (the toast tells the user saving needs an identity first).
- **Recorded deviations from the amendment text**: none functional. ⌘F opens CodeMirror's search panel (top-anchored, token-styled) — in-editor only, per spec. Table is a static 2×2 snippet. The headings dropdown is a native `<select>` (28px, token-styled) — keyboard/a11y for free.
- Renderer bundle: 1,295.39 kB → 2,296.75 kB raw (+1,001 kB, CodeMirror; 515 kB gzipped total) — local Electron asset, no network cost; acceptable per the sanctioned-dependency call in the amendment.

## Dev Agent Record

- 2026-07-10: deps pinned exact (`@codemirror/state` 6.7.1, `view` 6.43.6, `language` 6.12.4, `commands` 6.10.4, `search` 6.7.1, `lang-markdown` 6.5.0, `@lezer/highlight` 1.2.3). editorFormat.ts/.test.ts deleted (semantics carried into editorCommands tests). Full vitest 82 files / 703 tests green; typecheck green; build green. Two core git-integration suites (sync, poller) timed out once under parallel load, pass in isolation and on the clean rerun — pre-existing flake, not editor-related.
