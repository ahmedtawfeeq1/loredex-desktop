# Story 16.1: Reader corrections — full-bleed, wikilink colors, empty reading order

## Status

Done

## Story

**As a** vault reader,
**I want** the note column to use the full detail pane, wikilinks to always look like links, and reading-order sections to never render as silence,
**so that** the reader matches DESIGN.md Addendum D1 and the 2026-07-10 live-usage defects stay fixed.

## Acceptance Criteria

1. Note content uses the FULL detail-pane width: 32px side padding, no ch-measure cap — Reader, MOC/index pages, and handoff notes alike (Addendum D1 "Reader is full-bleed"; supersedes the v2 68–76ch measure and its fidelity test).
2. Index/MOC pages do not render their H1 twice: when the body's leading H1 equals the title the chrome already shows (the filename), it is stripped — same defect class as the fixed Home duplicate (14.2-1). Regression test required.
3. Wikilinks are always visibly links: `--gold` in dark theme, `#8A6116` in light, 500 weight, no underline at rest, underline on hover. Broken: rust dotted with the diagnostic tooltip. Verified against a real note with links.
4. A "Reading order" section never renders an empty list. Unresolved names render as plain rust text wired to Link Diagnostics (click opens the panel; the name is reported as a diagnostic). The user's empty-reading-order case from the nimbus vault (2026-07-10 handoff notes) is reproduced and its ROOT CAUSE fixed.

## Tasks / Subtasks

- [x] Full-bleed reader (AC: 1)
  - [x] `.note`: drop `max-width: 72ch` + centering, `padding: 32px 32px 64px`
  - [x] Update the design-fidelity reader-measure test to assert D1 full-bleed instead
- [x] Duplicate H1 strip (AC: 2)
  - [x] `stripDuplicateH1(markdown, title)` beside `splitLeadingH1` (the 14.2-1 fix); NoteView renders the stripped body; regression tests (equal → stripped, different → kept)
- [x] D1 wikilink colors (AC: 3)
  - [x] `--wikilink` token: `#8a6116` light / `#e0a83e` (gold) dark; `.note-body a.wikilink` color + 500 weight; hover underline and rust-dotted broken stand; fidelity class assertions
- [x] Empty reading order (AC: 4)
  - [x] Reproduce from the vault: `projects/nimbus-backend/handoffs/2026-07-10-handoff-nimbus-frontend.md` was BORN with an empty `## Reading order` (vault commit 1260052) — root cause is the WRITER, not renderer filtering
  - [x] Lib root-cause fix (loredex repo, local commit only): `createHandoff` and the CLI handoff writer omit the `## Reading order` section when the note list is empty
  - [x] Renderer hardening for existing notes: NoteView detects an empty Reading order section in the body and renders a rust empty-state line wired to Link Diagnostics — never silence
  - [x] `ReadingOrderInline`: broken names render as rust plain text (button) that reports to diagnostics and opens the panel — no more mute `<details>`
- [x] Tests (regression: duplicate-H1, empty-reading-order, link colors as class assertions)

## Dev Notes

- Addendum D1 is BINDING and supersedes conflicting v2 lines: the 68–76ch measure rule ("Type", "v0.1 defects" fidelity test) is replaced by full-bleed; the "wikilinks: navy" line in Tokens is replaced by the D1 colors. [Source: DESIGN.md#addendum-d1]
- Root-cause evidence for AC4: vault git history shows the empty notes created by lib `createHandoff` (commit message carries the `(Name)` suffix only that writer emits) with `notes: []` — reply handoffs commonly carry no notes. The desktop renderer never filtered anything; `parseReadingOrder` (lib) and `ReadingOrderInline` pass every name through, resolved or not. The CLI LLM writer has the same defect class (silent `known.has` filter can empty the list it writes). Both writers now omit the section entirely when empty.
- Lib change sanctioned by the cycle brief ("truly unavoidable → full suite green + local commit, no push"). Desktop pins `file:../loredex/loredex-2.1.0.tgz`, so the lib fix reaches the app at the next repack/repin; the renderer empty-state covers all existing vault notes meanwhile.
- Markdown still renders ONLY through the sanctioned pipeline; the H1 strip happens on the markdown string before `renderMarkdown`, exactly like the Home fix. [Source: architecture.md#coding-standards]
- Files: `src/renderer/src/styles.css`, `src/renderer/src/views/reader/NoteView.tsx`, `src/renderer/src/views/home/brief-title.ts`, `src/renderer/src/views/handoffs/ReadingOrderInline.tsx`, `src/renderer/src/design-fidelity.test.ts`; lib: `src/core/handoff.ts`, `src/commands/handoff.ts`.

### Testing

- Unit (colocated vitest): `stripDuplicateH1` equal/different/deep-H1 cases; NoteView static render asserts exactly one `<h1>` for an index page and the rust `ro-empty` state for the real 2026-07-10 vault body; `ReadingOrderInline` broken name renders `ro-unresolved` (seeded resolution); design-fidelity asserts the D1 token hexes, 500 weight, hover-only underline, rust dotted broken, and full-bleed `.note`. Lib: `createHandoff` with `notes: []` writes NO `## Reading order` heading (and still writes it with notes).

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from DESIGN.md Addendum D1 (M4 polish cycle) | Dev agent (BMAD) |
| 2026-07-10 | 1.0 | Implemented + verified against the real nimbus vault | Dev agent (BMAD) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Desktop, run sequentially: `npm run typecheck` clean (node+web) → `npm test` 70 files / 568 tests green → `npm run build` clean → `npm run test:e2e` 18/18 (~20 s).
- Lib (loredex repo): `npm run typecheck` clean, `npm test` 22 files / 145 tests green (incl. the new omit-empty-section regression); local commit `b5c3ffc`, NOT pushed.
- Real-vault verification (scratch vitest against the live nimbus vault, then removed): `projects/nimbus-backend/handoffs/2026-07-10-handoff-nimbus-frontend.md` renders the rust `ro-empty` state (was silence); `projects/nimbus-frontend/handoffs/2026-07-10-handoff-nimbus-ai-engine.md` renders 4 `class="wikilink"` anchors; `_index/nimbus-backend.md` renders exactly one `<h1>`.

### Completion Notes List

- ROOT CAUSE of the empty reading order (AC4): the story's renderer-filter hypothesis was disproved — the desktop never filtered anything. Vault git history (commit `1260052`, message suffix `(Rana Sabbah)` that only lib `createHandoff` emits) shows the 2026-07-10 notes were BORN with an empty `## Reading order`: `createHandoff` wrote the heading unconditionally and reply handoffs carry `notes: []`. The CLI LLM writer shares the defect class (silent `known.has` filter can empty the list it writes). Both lib writers now omit the section when empty; the renderer additionally shows a rust empty-state wired to Link Diagnostics for the notes already in vaults.
- `NoteView` split into a thin store-connected wrapper + props-driven `NoteArticle` — zustand's `useSyncExternalStore` serves the INITIAL state under `renderToStaticMarkup`, so store-free-below-the-view is what makes the regression tests honest.
- `stripDuplicateH1` sits beside `splitLeadingH1` (the 14.2-1 Home fix) — one file owns the defect class. Comparison is case-insensitive on the trimmed heading; curated H1s with their own wording are kept.
- Design-fidelity reader test updated per D1 (binding, supersedes the v2 68–76ch measure): `.note` asserts no `max-width`, `padding: 32px 32px 64px`. New D1 describe asserts `--wikilink` hexes both themes, 500 weight, hover-only underline, rust-dotted broken, rust `ro-unresolved`/`ro-empty`.
- Deviation: D1 says "unresolved names … with diagnostics" — implemented as broken names only; AMBIGUOUS names keep the expandable details (they resolve via the picker; flattening them to rust would hide real notes).
- Deviation/note: desktop pins `file:../loredex/loredex-2.1.0.tgz`, so the lib writer fix reaches the app at the next repack/repin (existing release-blocker action item); the renderer empty-state covers the gap and all historical notes.
- sprint-status.yaml carried unrelated uncommitted QA/M3 edits from a previous session — committed my epic-16 rows only (staged from HEAD + my hunk; the QA edits remain uncommitted in the worktree, untouched).

### File List

- src/renderer/src/styles.css — `.note` full-bleed; `--wikilink` token (both themes); wikilink 500 weight + token color; `.ro-unresolved` / `.ro-empty` rust styles
- src/renderer/src/views/reader/NoteView.tsx — `NoteArticle` (props-driven) + duplicate-H1 strip + empty-reading-order rust state wired to diagnostics
- src/renderer/src/views/reader/NoteView.test.ts — D1 regressions: duplicate H1 stripped/kept, empty vs populated reading order
- src/renderer/src/views/home/brief-title.ts — `stripDuplicateH1`
- src/renderer/src/views/home/brief-title.test.ts — `stripDuplicateH1` cases
- src/renderer/src/views/handoffs/ReadingOrderInline.tsx — `readingOrderEmptied`; broken names → `UnresolvedName` rust button (reports + opens Link Diagnostics)
- src/renderer/src/views/handoffs/ReadingOrderInline.test.ts — NEW: emptied-detection + unresolved/resolved rendering
- src/renderer/src/design-fidelity.test.ts — D1 full-bleed + wikilink class assertions
- docs/stories/epic16.story1-reader-full-bleed-wikilinks.md — this story
- docs/stories/sprint-status.yaml — epic-16 rows
- (lib, local commit b5c3ffc, no push) loredex: src/core/handoff.ts, src/commands/handoff.ts, tests/handoff-v2.test.ts
