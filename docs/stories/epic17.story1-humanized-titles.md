# Story 17.1: Humanized note titles — one util, every title surface

## Status

Done

## Story

**As a** vault reader working a real vault (~25 topics in one project, dated machine filenames everywhere),
**I want** every place a note NAME renders as a title to humanize it — leading `YYYY-MM-DD-` stripped to a mono date line, dashes to spaces, Title Case with the spec's small-word list — through ONE shared util,
**so that** the vault reads like a library instead of a filesystem, while the real filename stays reachable in the frontmatter panel and tooltips, per DESIGN.md "D1 amendment 3 — Humanized note titles".

## Acceptance Criteria

1. A pure `humanizeTitle(name)` util in a shared renderer module: strips a leading `YYYY-MM-DD-`, dashes → spaces (consecutive dashes collapse), Title Case with the spec small-word list verbatim (a, an, the, of, to, for, and, or, in, on — lowercased mid-title, first word always capitalized). A `noteDate(name)` helper extracts the stripped date (null when none).
2. The util applies on EVERY listed surface, no per-view drift: reader note header (serif humanized title + mono `--text-2` date line under it), vault tree rows (humanized + small right-aligned date), search results (view + ⌘K palette), atlas note cards (humanized title, date on the existing date line), handoff reading-order lists, home needs-attention rows.
3. The real filename stays visible: frontmatter panel (a `file` row) + tooltips on every humanized element.
4. Unit tests for the util (dates, small words, first-word capitalization, no-date names, consecutive dashes, bare-date names, `.md`/path stripping) + every listed surface asserted to use the util (grep-level drift guard) + the date-metadata styles pinned to mono `--text-2`.
5. Full gate green: typecheck, full vitest, production build.

## Tasks / Subtasks

- [x] `src/renderer/src/humanize.ts` (NEW, pure) (AC: 1): `humanizeTitle` + `noteDate`; defensively strips path prefixes and `.md` so every caller can pass whatever it holds (tree name, search hit name, wikilink target, atlas label, vault-relative path); a name that IS a bare date stays literal
- [x] Reader header (AC: 2, 3): `NoteView.tsx` h1 humanizes with `title={selected}` tooltip; `.note-date` mono line under the serif title; `FrontmatterPanel` gains an optional `path` prop rendering a `file` row (renders even for meta-less notes; standalone empty-meta behavior unchanged)
- [x] Tree rows (AC: 2, 3): `VaultTree.tsx` FileRow → humanized name span + right-aligned `.tree-file-date`; `.tree-file` goes flex; existing `title={node.path}` tooltip kept; `treeFilter.ts` now also matches the HUMANIZED title so users can find what they see ("error handling" hits `error-handling`)
- [x] Search results (AC: 2, 3): `SearchView.tsx` row title humanizes (highlight runs over the humanized text) with `title={hit.path}`; `Palette.tsx` hits + recents humanize (dropping its local `titleOf`), row tooltip carries the path, recents meta line still shows the raw path
- [x] Atlas note cards (AC: 2, 3): `AtlasNodeCard.tsx` NoteBody humanizes the label; the stripped date rides the EXISTING date line as fallback (`node.date ?? noteDate(label)`); native SVG `<title>` keeps the filename on hover
- [x] Reading-order lists (AC: 2, 3): `ReadingOrderInline.tsx` summary humanizes with an `.ro-date` mono chip and `title={target}`; unresolved names stay VERBATIM (they are diagnostics naming the literal broken link text)
- [x] Home attention rows (AC: 2, 3): `HomeView.tsx` AttentionRow name-fallback humanizes (`card.objective || humanizeTitle(card.name)`), filename in the tooltip
- [x] Tests (AC: 4): `humanize.test.ts` — 8 util cases + noteDate cases + a synthesized real-vault-scale fixture (25 dated topics in one project, the user's pain shape: every title date-free, dash-free, capitalized, date extracted) + per-surface drift guard (import + usage grep on all 7 files) + tooltip/frontmatter filename assertions + stylesheet contract (`.note-date`/`.tree-file-date`/`.ro-date` mono `--text-2`, `.tree-file` flex)

## Dev Notes

- DESIGN.md "D1 amendment 3 — comprehension pass", paragraph "Humanized note titles", read verbatim, is the binding spec. [Source: DESIGN.md#d1-amendment-3]
- **Title Case shape**: only the first letter uppercases — existing mid-word casing survives (`OAuth-flow` → `OAuth Flow`), plain lowercase words get plain capitalization (`api` → `Api`). No acronym dictionary — that would be per-view drift by another name.
- **stripDuplicateH1 untouched**: the 16.1 duplicate-H1 strip still compares the body H1 to the RAW filename title (that is what writers emit); the humanized string is display-only, downstream of it.
- **Search-highlight nuance**: `SearchView` highlights the query inside the humanized title, so a dash-spanning query (`error-handling`) highlights nothing in the title while still matching (the meta/snippet carry it). Recorded, accepted — the hit itself comes from the backend.
- **Palette recents**: `titleOf` (basename strip) deleted in favor of the util — `humanizeTitle` subsumes it since it strips path + `.md` itself.
- **Atlas**: only NOTE cards humanize; handoff/contract/source/commit labels are machine identifiers by design (routes, file paths, shas) and the amendment scopes humanization to note NAMES.
- **styles.css**: one appended block + the `.tree-file` display change; design-fidelity assertions untouched and green.

## Dev Agent Record

- 2026-07-10: implemented as specced, no scope growth beyond one rider: `treeFilter` matches humanized titles too (users search what they see — one guard clause, tested by the existing filter suite plus the drift guard). Gate: typecheck clean, vitest 84 files / 756 tests green (was 735 — +21 here), production build clean. Deviations recorded in Dev Notes (unresolved reading-order names stay verbatim; non-note atlas cards stay machine-labeled).

## QA Results

**Verdict: PASS** — fresh-eyes QA 2026-07-10 (M5 comprehension cycle).

- `humanizeTitle`/`noteDate` (`src/renderer/src/humanize.ts`) match D1a3 verbatim: small-word set `a,an,the,of,to,for,and,or,in,on` (lowercased mid-title, first word always capitalized), leading `YYYY-MM-DD-` strip, bare-date stays literal, consecutive dashes collapse (`split(/[-\s]+/).filter(Boolean)`), path + `.md` stripped defensively, existing casing survives (`OAuth`→`OAuth`).
- ALL title surfaces wired to the one util (grep-confirmed, no per-view drift): reader header (`NoteView.tsx`, serif title + mono `.note-date`), tree rows (`VaultTree.tsx`), search view (`SearchView.tsx`), ⌘K palette (`Palette.tsx`), atlas note cards (`AtlasNodeCard.tsx`), reading orders (`ReadingOrderInline.tsx`), home attention rows (`HomeView.tsx`), plus the `treeFilter.ts` rider (filter matches humanized titles).
- AC3 real filename reachable: `FrontmatterPanel` renders a `file` row from `path={selected}` and every humanized element keeps a `title=` tooltip.
- `humanize.test.ts` drift guard + per-surface import/usage assertions green. No defects in this story.
