# Story 14.1: DESIGN v2 token & layout migration + theme switcher

## Status

Done

## Story

**As a** user,
**I want** every view reskinned to the v2 light-first design with a system/light/dark switcher,
**so that** the app reads as one product — card catalog, daylight edition.

## Acceptance Criteria

1. The v2 token set ships verbatim on `:root` (light default) + `[data-theme="dark"]` override: `--bg-app/--bg-card/--bg-inset/--hairline/--text-1/--text-2/--gold/--gold-ink/--navy/--rust/--ok` with the exact hex values from DESIGN.md; all v1 token references are migrated (no orphan variables, no hardcoded colors).
2. Every view adopts the v2 surface language: window ground `--bg-app`; every content region a card (`--bg-card`, 1px `--hairline`, radius 12px, shadow `0 1px 3px rgba(19,24,38,0.06)`, 16px padding, 12px gaps); sidebar flat with gold left-rail active state; vault chip as white card; list rows 38px; buttons = gold pill primary / navy outline secondary / rust outline destructive; modals and toasts per spec.
3. A Settings **theme switcher (system / light / dark)** persists to app-db and applies live; "system" follows the OS; both themes pass a full-view sweep (no system blue, no purple, max one gold primary per view, no border > 1px, no serif in nav/buttons).
4. The stamp chip palette moves to v2 (OPEN gold, ACCEPTED navy, DECLINED/STALE rust, CONSUMED `--text-2`, SNOOZED dashed) wherever Epic 8 hasn't already; focus-visible 2px gold ring offset 2px everywhere; reduced-motion respected.
5. The Story 6.3 design-fidelity assertions (or their vitest equivalents) are updated to v2 values and pass.

## Tasks / Subtasks

- [x] Token migration (AC: 1)
  - [x] Replace the v1 palette in `styles.css` with the v2 table; grep-kill hardcoded hex/system colors; map v1 accent (`--ok` promotion) usages to their v2 roles (ok demoted to status-only, gold is THE accent)
- [x] Surface migration per view (AC: 2, 4)
  - [x] Sidebar/nav, reader, board + cards, search, home, activity, sync/settings, diagnostics — card treatment, buttons, modals, toasts, stamp chips, badges (gold pill + `--gold-ink`)
- [x] Theme switcher (AC: 3)
  - [x] Settings row (segmented control: system/light/dark) → `app_settings`; `data-theme` attribute swap + `prefers-color-scheme` listener for "system"
- [x] Sweep + tests (AC: 3, 5)
  - [x] Both-themes screenshot/manual sweep against the Don't list; update fidelity tests to v2 tokens

## Dev Notes

- DESIGN v2 supersedes v1 and is binding: light-first, logo palette (navy/gold/paper), airy cards; deviations go in the Dev Agent Record with a reason. The token table, layout rules, and Don't list are the checklist — this story is mechanical fidelity, not invention. [Source: DESIGN.md#tokens] [Source: DESIGN.md#layout] [Source: DESIGN.md#dont]
- Gold discipline is the highest-risk regression: one gold primary per view maximum; secondary = navy outline. "If everything is gold, nothing is." [Source: DESIGN.md#tokens]
- Theme preference is per-user app state → `app_settings` (Story 3.6/9.2), never the vault. [Source: architecture-m2.md#3-app-db]
- Type roles are unchanged from v1 (sans chrome 13/11px, serif titles/empty states, mono paths/hashes/dates); the reader-centering fix is Story 14.2's defect list — don't double-fix, but don't regress it either. [Source: DESIGN.md#type]
- Sequencing: run this AFTER the M2 feature views (epics 7/8/10/11/12/13) land so new surfaces are built once against v2 components — new views in earlier stories should consume tokens, not literals, to keep this story a palette swap plus layout pass.
- Files: `src/renderer/src/styles.css` (tokens), all view/component styles, `src/renderer/src/views/settings/` (switcher), `src/renderer/src/stores/settings.ts`.

### Testing

- Unit: theme-switch behavior (attribute swap, system listener, persistence). Fidelity: token-value assertions in both themes, focus-ring presence, reduced-motion media respected; visual sweep per view against the Don't list. [Source: DESIGN.md#quality-floor-non-negotiable-carried-from-v1]

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from DESIGN.md v2 (M2 cycle) | Bob (SM) |
| 2026-07-10 | 1.0 | Approved | Sarah (PO) |

## Dev Agent Record

### Agent Model Used

claude-fable-5 (Fable 5)

### Debug Log References

- `npm run typecheck` clean (node + web)
- `npx vitest run` → 26 files / 139 tests passed (incl. new `design-fidelity.test.ts`, `theme.test.ts`, `settings.test.ts`)
- `npm run build` → electron-vite production build green

### Completion Notes List

- Tokens: v2 table shipped verbatim on `:root` (light default) + `:root[data-theme='dark']`; all v1 tokens (`--ink/--stamp/--bg-raised/--bg-content/--bg-sidebar`) removed and their usages remapped (`--ok` demoted to status-only; gold is the accent). `design-fidelity.test.ts` asserts the exact hex values in both themes and that no v1 token survives.
- Theme resolution: the renderer stamps the RESOLVED theme (`light`/`dark`) on `<html data-theme>` before first paint (`initTheme()` in `main.tsx`); "system" keeps a `prefers-color-scheme` listener attached, so the CSS needs only the light default + dark override — no duplicated `@media` token block.
- **Deviation (persistence seam):** the story's `app_settings` table (app-db) does not exist yet — app-db is story 9.2 in this cycle and this batch runs first. Theme persists through the existing marked seam `src/core/settings.ts` (userData settings JSON), which story 9.2 migrates into app.db wholesale; the `settings.theme.get/set` channels won't change.
- **Deviation (sidebar vibrancy):** `src/main/windows.ts` still passes `vibrancy: 'sidebar'`, but the body is now opaque `--bg-app` per the v2 "flat sidebar, no vibrancy dependency" rule — the vibrancy simply no longer shows. Left untouched (main is logic-free; removing it is cosmetic churn).
- Gold discipline: Settings had two gold primaries (Save identity + Save port); MCP save is now a navy-outline `.button-secondary`. `.button-secondary`/`.button-destructive` pill classes added per spec.
- Stamp chips: full v2 palette wired in `StatusChip` (OPEN gold, ACCEPTED navy, DECLINED/STALE rust, CONSUMED/DONE text-2, SNOOZED dashed) plus a `.chip-request` navy class ready for the Epic 8 REQUEST chip; stamp-press animation and reduced-motion behavior unchanged.
- Modal/toast/segmented-control CSS shipped (`.seg-control`, `.toggle-row`, `.toast*`) so Epic 7/8/13 surfaces build on v2 primitives; no modal exists yet to migrate.
- Don't-list sweep: markdown blockquote rail reduced 2px→1px (no border > 1px); the only >1px borders left are the sanctioned 4px gold left rails — asserted by regex in the fidelity suite.
- Sync-dot store tones keep their story-5.2 names (`ink/amber/rust`) to avoid churning `stores/sync.ts` + tests; the classes now map to `--ok`/`--gold`/`--rust`.

### File List

- src/renderer/src/styles.css (v2 rewrite)
- src/shared/theme.ts (new), src/shared/theme.test.ts (new)
- src/shared/ipc-contract.ts (`settings.theme.get/set`)
- src/core/settings.ts (+ theme load/save), src/core/settings.test.ts (new)
- src/core/handlers.ts (theme channels)
- src/renderer/src/stores/settings.ts (new theme store + initTheme)
- src/renderer/src/views/settings/ThemeSection.tsx (new)
- src/renderer/src/views/settings/SettingsView.tsx, McpSection.tsx (secondary button)
- src/renderer/src/components/StatusChip.tsx (v2 states)
- src/renderer/src/main.tsx (initTheme before paint)
- src/renderer/src/design-fidelity.test.ts (new)

## QA Results
