# Story 17.3: Read-mode find bar (⌘F)

## Status

Done

## Story

**As a** vault reader scanning a long note on a real vault (~25 topics in one project),
**I want** a ⌘F find bar in the note pane — type a term, see `N/M`, step matches with Enter/⇧Enter or the ↑↓ buttons, toggle case, close with Esc, with every match highlighted and the current one gold,
**so that** I can locate text in a rendered note the way I do in VS Code / Obsidian, without leaving Read mode — per DESIGN.md "D1 amendment 3 — Read-mode find bar (⌘F)".

## Acceptance Criteria

1. **The bar.** In Read mode, ⌘F opens a floating bar top-right of the note pane: query input, `3/17` counter, prev/next (↑↓ buttons + Enter/⇧Enter), a case-sensitive `Aa` toggle, and Esc to close.
2. **Highlighting.** All matches highlight `--bg-inset` (with a hairline cue); the current match is gold. The query scan is debounced 150ms and operates on the RENDERED note DOM. The current match scrolls into view.
3. **Coexistence.** The find highlight rides the CSS Custom Highlight API under its OWN names (`loredex-find`, `loredex-find-current`), separate from the comment anchor highlight (`loredex-anchor`) — an anchored comment and a find hit on the SAME text never clobber each other.
4. **Mode split.** ⌘F in Read mode opens this bar; Edit mode keeps CodeMirror's own ⌘F. The action is registered in the global registry, so palette coverage stays green.
5. **DoD.** Tests for match counting, navigation wrap-around, case toggle, Esc close, and coexistence with an anchored comment on the same text; full gate green (typecheck, full vitest, build).

## Tasks / Subtasks

- [x] Pure engine (AC: 1, 2, 3, 5): `src/renderer/src/views/reader/findEngine.ts` — `computeMatches` (non-overlapping, case-flagged), `navigate` (wrap-around), `counterLabel`, `findKeyAction` (Enter/⇧Enter/Esc); plus the DOM-guarded highlight layer: `rangeForSpan`, `applyFindHighlights`, `writeFindHighlights`/`clearFindHighlights` (injectable registry), `scrollFindMatchIntoView`, and the find-only highlight NAME constants.
- [x] Store (AC: 1, 4): `src/renderer/src/stores/find.ts` — `open`/`query`/`caseSensitive`/`total`/`current`; `openBar`/`close`/`setQuery`/`toggleCase`/`setResults`/`next`/`prev`/`reset`. The node-testable seam between the action, the UI, and the reader's DOM scan.
- [x] Component (AC: 1, 2): `src/renderer/src/views/reader/FindBar.tsx` — the floating bar, wired into `NoteArticle` with the note's `bodyRef` + `renderKey`. Debounced 150ms scan effect; an immediate navigation-repaint effect; unmount/close clears the find highlights.
- [x] Action (AC: 4): `action:find-in-note` (`⌘F`, `{ key: 'f', meta: true }`) added to `registry.ts` — opens the bar only from the reader with a note open, no-ops in Edit mode on that note (CodeMirror keeps its ⌘F). Auto-listed in the ⌘K palette + cheatsheet.
- [x] CSS (AC: 1, 2, 3): `styles.css` — `.find-bar` (floating top-right card, 1px hairline), input/counter/nav/case/close controls, `.find-case[aria-pressed]` gold; `::highlight(loredex-find)` (`--bg-inset` + hairline underline) and `::highlight(loredex-find-current)` (gold).
- [x] Hygiene (AC: 4): `useFind.reset()` added to App's `onVaultChanged` reset list.
- [x] Tests (AC: 5): `findEngine.test.ts` (match counting, case toggle, wrap-around, key map, coexistence via a fake registry + `ANCHOR_HIGHLIGHT_NAME` import), `find.test.ts` (store open/close/toggle/wrap-around/reset), and a `registry.test.ts` case (⌘F combo + Read-only / Edit-mode guard).

## Dev Notes

- DESIGN.md "D1 amendment 3", the "Read-mode find bar (⌘F)" paragraph, read verbatim, is the binding spec. [Source: DESIGN.md#d1-amendment-3]
- **Coexistence mechanism.** The comment anchor highlight (story 16.4) already uses the CSS Custom Highlight API under `loredex-anchor` and also wraps `.anchor-target` spans for hover — neither mutates the text stream. Find adds two more Custom Highlight names and reads the SAME text-node stream via `rangeForSpan`. Because `CSS.highlights` is keyed by name, and find only ever set/deletes its own two names, the anchor paint survives every find write/clear. The current match is EXCLUDED from the all-set so each hit paints exactly once (gold wins because it is its own name, not stacked).
- **Two effects, one debounce.** The 150ms debounce guards only the query scan (`open`/`query`/`caseSensitive`/`renderKey`). Navigation (prev/next) repaints the gold current match immediately off the cached match positions in a ref — stepping matches never waits 150ms.
- **Mode split is layered.** In Edit mode the `NoteArticle`/`FindBar` subtree is unmounted (NoteView renders `NoteEditor`), so no bar exists; the `action:find-in-note` run() also guards `editor.editing && path === selected`; and CodeMirror's own keymap prevent-defaults ⌘F and stops propagation before the App-shell handler. Three layers, all pointing the same way.
- **Node test env.** The suite runs under `environment: 'node'` (no jsdom), so the DOM highlight helpers are guarded no-ops in tests (the anchorHighlight precedent). Coexistence is proven at the registry layer with a Map-backed fake registry that already holds `ANCHOR_HIGHLIGHT_NAME`, asserting find writes/clears leave it intact — plus a string-level check that the same text is simultaneously an anchored span and a find hit.

## Deviations

- **Hairline "ring" approximation.** DESIGN specifies all-matches as `--bg-inset` + a hairline ring. The CSS Custom Highlight API paints only background/color/text-decoration/text-shadow — it cannot box a border. The all-match paint uses `background-color: var(--bg-inset)` plus a hairline `text-decoration: underline` as the ring cue; the gold current match is unmistakable. No stylesheet border > 1px introduced (design-fidelity Don't-list stays green).
- **App visual drive skipped** per the standing QA convention (a dev launch needs electron-rebuild, which breaks the node-test ABI). Verification is the full pure/store test coverage of the DoD items plus the full gate.

## Dev Agent Record

- 2026-07-10: implemented as specced. Gate: typecheck (node+web) clean, full vitest 800/800 sequential (89 files; +30 here — findEngine, find store, registry ⌘F guard), production build clean. `npx vitest run` flakes 6 git-heavy sync/poller tests under default file-parallelism (the documented concurrency flake); `npx vitest run --no-file-parallelism` is 800/800 green. No new dependencies; find rides the existing Custom Highlight seam under new names.
