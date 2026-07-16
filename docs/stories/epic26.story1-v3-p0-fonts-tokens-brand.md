# Story 26.1: DESIGN v3 P0 — fonts + tokens + brand mark

## Status

Done

## Story

**As a** loredex user,
**I want** the app repainted in the approved v3 "Obsidian Glass / Cobalt" system — Geist type, dark-first cobalt tokens, the real R1 brand mark,
**so that** every later v3 phase (primitives, Today, Inbox, …) builds on the locked palette instead of the retired gold/navy v2 skin.

Spec: docs/DESIGN.md `## v3 amendment` §2 (tokens), §3 (type), §6.1 (this phase), §8 (brand/terminology flags). Pixel reference: `handoff/loredex-v2-prototype.html` + `handoff/screens/01–10`. Brand: `handoff/loredex-brand-identity.html` + `handoff/brand/`.

## Acceptance Criteria

1. Geist (400/500/600/700) + Geist Mono (400/500/600) are self-hosted woff2 in `assets/fonts/` with `@font-face` in `assets/fonts.css`; `--font-ui` leads with Geist, `--font-mono` with Geist Mono; note-role defaults are Geist / Geist Mono (§3 — retro/serif *defaults* retired; the note-font user setting stays, and both faces are pickable in the catalog).
2. `styles.css` holds the §2 token table verbatim, dark-first: `:root` = dark, `[data-theme='light']` = override. `--gold` / `--gold-ink` / `--navy` are gone; every former usage is remapped per §2 (buttons/selection/interactive → `--accent`, OPEN/stale/pending/blocking states → `--warn`, REQUEST/neutral-meta chips → `--info`, ink text → `--text-1`, links → `--link`). No layout changes.
3. The global focus ring is cobalt (`2px solid var(--accent)`, offset 2), reduced-motion stays global, both themes fully wired (v2 quality floor).
4. `BrandMark.tsx` renders the locked R1 mark (cobalt gradient tile, two filed cards, green live row) from `handoff/brand/loredex-mark.svg`; `build/icon.*` regenerated from `handoff/brand/icon-1024.png`. The brass placeholder is retired everywhere (FirstRun's inline ring mark now renders BrandMark).
5. `design-fidelity.test.ts` asserts the §2 hexes in both themes, the dark-first selector shape, the cobalt focus ring, the retired-token list, Geist stacks, and the updated Don't list (any gradient must be the §4 cobalt button recipe); `atlas-fidelity.test.ts` + `editorTheme.test.ts` updated in the same PR. Gates green: `typecheck`, `test`, `test:e2e`.

## Dev Notes

- P0 is a recolor: **no layout changes, no new components** — primitives are P1.
- Geist woff2s vendored from the `geist` npm package (Vercel, SIL OFL 1.1) — static weights, not the variable file, to match the one-block-per-weight `fonts.css` pattern.
- Theme default stays `system`; dark-first means the *stylesheet* default is dark (§6.1 "theme default → system-dark"), and `resolveTheme` still follows the OS.
- Files: `src/renderer/src/styles.css`, `assets/fonts.css`, `assets/fonts/geist-*.woff2`, `src/shared/fonts.ts`, `src/shared/theme.ts` (comment), `components/BrandMark.tsx`, `views/wizard/FirstRun.tsx`, `views/reader/editorTheme.ts`, `views/reader/ListResizeHandle.tsx`, `views/clients/*.tsx`, `views/atlas/atlas.css`, `views/atlas/AtlasCanvas.tsx`, `views/home/home.css`, `build/icon.*`, the three fidelity/theme test files, `docs/DESIGN.md`.

## Dev Agent Record

Deviations / judgment calls (spec §7.3 — reason required):

- **`--brand` kept at §2's brass values but is now unused**: the locked R1 mark carries its own cobalt/green hexes from the brand asset (§8: the brass token was provisional). Kept the token because §2 defines it and the fidelity test asserts §2 verbatim; retiring the token itself needs a spec amendment, not silence.
- **Comment-anchor highlight (`::highlight(loredex-anchor)`) → `--accent` tint, not `--warn`**: §2's remap rule offers warn-or-accent; an amber underline across every commented passage would read as a warning state. Comments are interactive/navigable → accent. Same call for CodeMirror selection/search-match tints.
- **Ink on amber fills** (`.nav-badge`, atlas open-count dot/badge, `.contract-link-chip.chip-mentioned`): `--gold-ink` had no v3 successor; used `var(--bg-app)` (dark ground on amber in dark, paper on dark-amber in light — both AA). §4's glyph-chip recipe replaces these fills in P1.
- **`.feed-kind-status` + REQUEST chips → `--info`** (was navy): §1 assigns neutral meta / REQUEST to info explicitly.
- **`.chip-accepted`, `.feed-action`, secondary/emphasis buttons → `--text-1`** (mechanical navy→ink per §2 line "navy text → --text-1"); their §4 re-skin is P1's StatusChip/Button migration.
- **Atlas search rings + selected card stroke → `--accent`** (selection semantics), blocking edges / open dots / hot-edge emphasis → `--warn` (attention semantics). Class + identifier renames kept minimal (`atlas-arrowhead-gold`→`-warn`, local `gold` flag→`warn`); `threadGold` internal name survives (identifier-only, per §8's "legacy identifiers may survive internally").
- **`--wikilink` revalued to cobalt** (#8fb1f5 dark / #2e5fc7 light — same as `--link`): §2 defines no wikilink token; §1's link law says cobalt. Wikilinks stay distinguishable by weight + underline-on-hover-only (D1), external links stay underlined at rest (D2).
- **`fonts.test.ts` count bumped 15→17** (catalog gains geist, geist-mono).
- Known-flaky `src/core/set-frontmatter.test.ts` timed out once in the full run and passes isolated (pre-existing; unrelated to CSS/font changes).

## Verification artifacts

- `assets/epic26-p0-light-1280.png` — live dev app after the recolor (light theme; captured on a light-mode host). Dark rendering is enforced by the fidelity test's §2 dark table (dark IS `:root`) and was smoke-verified via a dark-scheme-emulated renderer load (`--bg-app #0b0d12` ground). P0 rebuilds no views, so the screens/01–10 side-by-sides start with P2; this capture documents the wholesale recolor instead.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-16 | 1.0 | P0 implemented: §2 token swap (dark-first), Geist self-hosted + defaults, gold/navy remap (141 declarations in styles.css + atlas.css/home.css/TSX strays), R1 mark + build icons, fidelity tests rewritten, DESIGN.md v3 amendment appended | Claude (dev agent) |
