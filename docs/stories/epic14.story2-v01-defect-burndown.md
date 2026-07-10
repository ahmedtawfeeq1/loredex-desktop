# Story 14.2: v0.1 defect burn-down

## Status

Done

## Story

**As a** user of v0.1,
**I want** the known paper cuts fixed in one pass,
**so that** the M2 release polishes what exists instead of shipping new features on old bruises.

## Acceptance Criteria

1. **Duplicate Start-Here heading**: the home view renders the brief title exactly once (kill the view-chrome/markdown-H1 double).
2. **Activity event dedupe**: feed events are deduped by commit hash (one commit = one event row, however many parse passes ran); full note paths appear on hover (tooltip/title), keeping rows dense.
3. **Reader content centering**: rendered markdown body is centered in the pane at 68–76ch measure — no dead left gutter — matching the DESIGN v2 type spec.
4. **Broken-links badge → diagnostics panel**: the broken-links count badge is clickable, opening a diagnostics panel listing every broken link (source note + raw target), each row navigating to the source note; never auto-created.
5. **Sync/Settings density**: sync health and settings views adopt the v2 card density (cards, 38px-class rows, toggle rows per the modal/settings pattern) — no web-app 24px+ padding in dense lists.
6. Each fix carries a regression test (or fidelity assertion) so it stays fixed.

## Tasks / Subtasks

- [x] Start-Here heading (AC: 1)
  - [x] Home: suppress the rendered H1 when the view chrome already titles the brief (or vice versa — one owner, recorded)
- [x] Activity dedupe + paths (AC: 2)
  - [x] Feed store: key events by commit hash, merge duplicates; row hover exposes full path(s) via title/tooltip
- [x] Reader centering (AC: 3)
  - [x] Reader pane: centered column, measure 68–76ch, sans 14px/1.6 body per spec
- [x] Diagnostics panel (AC: 4)
  - [x] Make the badge a button → `DiagnosticsPanel.tsx` (card list: source, target, jump-to-note); data from the existing Story 2.2 broken-link index
- [x] Sync/Settings density (AC: 5)
  - [x] Re-lay both views on v2 cards + toggle rows; audit paddings against the Don't list
- [x] Regression tests (AC: 6)

## Dev Notes

- These are the recorded v0.1 defects (QA pass 2026-07-10 + DESIGN v2 callouts) — scope is exactly these five; new findings go to the board, not this story.
- Reader centering is called out in the DESIGN v2 type spec verbatim ("centered in the pane — no dead left gutter (v0.1 defect)"); density rules and toggle-row pattern per layout spec. [Source: DESIGN.md#type] [Source: DESIGN.md#layout] [Source: DESIGN.md#dont]
- Activity dedupe: dedupe at the store/render layer by commit hash — do NOT fork the lib's `parseActivity` grammar (anti-second-engine applies to interpretation too; if the grammar itself double-emits, file a lib issue instead).
- Broken-link data already exists (Story 2.2 diagnostics list) — this story is surfacing, not re-detection.
- Sequencing: run LAST, after Story 14.1, so density/centering fixes land on v2 surfaces once.
- Files: `src/renderer/src/views/home/`, `src/renderer/src/stores/activity.ts`, `src/renderer/src/views/reader/` (+styles), `src/renderer/src/views/reader/DiagnosticsPanel.tsx`, `src/renderer/src/views/settings/`, `src/renderer/src/views/sync/`, tests alongside.

### Testing

- Unit: dedupe-by-hash fixture (same commit, 3 raw events → 1 row), heading single-render assertion, diagnostics panel navigation. Fidelity: centering measure + density paddings asserted in the design-fidelity suite. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from v0.1 QA findings + DESIGN v2 (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- `npm run typecheck` clean; `npx vitest run` → 28 files / 150 tests passed; `npm run build` green
- Real-launch evidence (dev app on the `_machine2/nimbus-vault` test vault): light theme Reader (single H1 home earlier, 15-BROKEN-LINKS pill visible), dark theme Home (single "Start here — Product" H1, centered column) — screenshots `v2-light.png` / `v2-dark.png` in the session scratchpad

### Completion Notes List

- **AC1 (heading)**: one owner, recorded — the view chrome owns the title. `splitLeadingH1` (new `views/home/brief-title.ts`) lifts the brief's own leading H1 into the chrome title (fallback "Start Here — Product") and strips it from the rendered body, so curated briefs keep their wording and the title renders exactly once. Unit-tested incl. no-H1, blank-lines, and mid-document-H1 cases.
- **AC2 (activity dedupe)**: `dedupeBySha` in `feed-logic.ts`, applied at the store layer (`stores/feed.ts` load) — the lib's `parseActivity` grammar is untouched (anti-second-engine). Fixture test: 3 raw events, same commit → 1 row, first kept, order preserved. Rows stay dense: the meta line now shows the note basename; the full vault path rides the row's hover `title`.
- **AC3 (centering)**: `.note` is `margin-inline: auto` at a 72ch measure (68–76 window), sans 14px/1.6 body — asserted in `design-fidelity.test.ts` so it stays fixed.
- **AC4 (diagnostics)**: badge was already a button (story 2.2); the panel's link rows are now buttons that navigate to the source note (`useReader.open`), each showing source note + raw `[[target]]`, never auto-created. Pure helpers `orderNotes`/`brokenLinkCount` extracted to `stores/diagnostics.ts` and unit-tested (count, open-note-first ordering, report dedupe). **Deviation:** kept the existing `Diagnostics.tsx` filename instead of creating a parallel `DiagnosticsPanel.tsx` — same component, shortest diff.
- **AC5 (density)**: sync grid/sections and settings sections are v2 cards with 38px-class rows (`.sync-row`, `.settings-field`, `.toggle-row` min-height 38px, 16px card padding — no 24px+ list padding); the theme row uses the toggle-row + segmented-control pattern. Fidelity assertions cover the row heights and padding.
- **AC6**: every fix carries a regression test — `brief-title.test.ts`, `feed-logic.test.ts` (dedupe + basename), `diagnostics.test.ts`, and the centering/density blocks in `design-fidelity.test.ts`.
- Rider fix (found during the real launch): early renderer invokes are dropped with `PORT_SWAPPED` on the first port attach, so the story-14.1 theme load silently kept the OS theme; `stores/settings.ts` now retries once (the `app.init` pattern). Verified live — persisted light/dark both render after relaunch.

### File List

- src/renderer/src/views/home/brief-title.ts (new), brief-title.test.ts (new), HomeView.tsx
- src/renderer/src/views/feed/feed-logic.ts (+dedupeBySha, noteBasename), feed-logic.test.ts, FeedView.tsx
- src/renderer/src/stores/feed.ts (dedupe on load)
- src/renderer/src/stores/diagnostics.ts (+orderNotes, brokenLinkCount), diagnostics.test.ts (new)
- src/renderer/src/views/reader/Diagnostics.tsx (clickable rows)
- src/renderer/src/stores/settings.ts (PORT_SWAPPED retry)
- src/renderer/src/styles.css (centering + density landed with 14.1's v2 pass)
- src/renderer/src/design-fidelity.test.ts (centering + density assertions)

## QA Results

### Review — QA agent (fresh eyes), 2026-07-10

**Verdict: PASS.** Suites: app vitest 488/488 (63 files, incl. the new `tests/m2-e2e-drive.test.ts` module drive), lib vitest 143/143, typecheck (node+web) clean, production build clean. — all five v0.1 defects stay fixed, each with regression coverage:

1. Start-Here heading rendered once (`brief-title.test.ts`).
2. Feed dedupe by commit sha + full paths on hover (`feed-logic.test.ts`, store wires `dedupeBySha`).
3. Reader centered at 68–76ch, no dead gutter (`design-fidelity.test.ts`).
4. Broken-links badge → Diagnostics panel, rows jump to source (`diagnostics.test.ts`, rendered app-root).
5. Sync/Settings on v2 card density, 38px-class rows (fidelity assertions).
