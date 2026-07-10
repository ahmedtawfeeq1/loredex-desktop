# Story 16.2: Collapsible rails — sidebar icon rail + file-list collapse

## Status

Done

## Story

**As a** vault reader,
**I want** to collapse the nav sidebar to a slim icon rail and the file-list pane away entirely,
**so that** the reader gets the full window when I'm reading, per DESIGN.md Addendum D1 "Collapsible rails".

## Acceptance Criteria

1. Both the nav sidebar and the file-list pane collapse: chevron affordance in each pane header + ⌘\ (sidebar) and ⌘⇧\ (file list).
2. Collapsed sidebar = 56px icon rail: nav labels become icon glyphs (no emoji in chrome — inline SVG), the handoffs count badge survives as a gold dot, the vault identity chip collapses to its sync dot with the full identity in the tooltip.
3. Collapsed file list = 0 width — the reader goes full-bleed to the sidebar. An expand chevron stays mouse-reachable (reader pane, top-left) while collapsed.
4. Collapse state persists PER VAULT through the app-side settings store (app.db `app_settings`, never the vault — state-placement rule).
5. Animation 160ms ease-out on the pane widths; none under reduced-motion (the global rule).
6. Both actions are registered in the global action registry — palette-listed with hints, cheatsheet-documented, and covered by the palette-coverage test.

## Tasks / Subtasks

- [x] Contract + core (AC: 4)
  - [x] `RailsCollapsed { sidebar, list }` in shared/types.ts; `settings.rails.get/set` channels (app-local contract evolution)
  - [x] `loadRailsCollapsed`/`saveRailsCollapsed` in core/settings.ts over `appSettingGet/Set` (per-vault key `rails`)
  - [x] Handlers beside settings.theme: get degrades to expanded with no db/vault; set requires the db (same rule as projectRoots.set)
  - [x] Per-vault persistence unit test (two vault ids never clobber each other; malformed JSON degrades to expanded)
- [x] Renderer store (AC: 1, 4)
  - [x] `stores/rails.ts`: `sidebar`/`list` collapsed flags, `toggleSidebar`/`toggleList` (persist best-effort), `load` (PORT_SWAPPED retry, theme-store pattern), `reset`
  - [x] App.tsx: load on start + reset/reload on vault change; store unit test with a stubbed bridge
- [x] Registry actions (AC: 1, 6)
  - [x] `action:toggle-sidebar` ⌘\ and `action:toggle-list` ⌘⇧\ (event key `|`), dynamic collapse/expand titles
  - [x] registry.test: explicit combos/uniqueness + run() flips the store; palette coverage inherits both rows
- [x] Sidebar icon rail (AC: 2)
  - [x] `NavIcon` (9 inline SVG glyphs keyed by AppView) + shared `RailChevron`; sidebar head chevron
  - [x] Collapsed: icon-only nav items (aria-label + title keep the name), `.nav-dot` gold dot badge, Route button hidden (⇧⌘R + palette keep it reachable), vault chip → dot + tooltip
- [x] File-list collapse (AC: 3)
  - [x] Chevron in the pane-list header beside Refresh; `.rail-collapsed` → width 0, gap swallowed, visibility hidden after the slide (tab order stays clean)
  - [x] `.rail-expander` chevron in the reader pane while collapsed
- [x] Motion + fidelity (AC: 5)
  - [x] `transition: width 160ms ease-out` both rails; global reduced-motion rule already kills it — design-fidelity assertions for widths + timing

## Dev Notes

- Addendum D1 "Collapsible rails" is the binding spec: 56px icon rail, badges→dots, list→0, per-vault persistence, 160ms ease-out, reduced-motion off. [Source: DESIGN.md#addendum-d1]
- State placement: collapse state is a UI pref → app.db only (`app_settings` is already vault-scoped by `vault_id`); the vault is never written. [Source: architecture.md#state-placement]
- The action registry is THE single source (story 15.3): adding the two actions there makes them palette rows, cheatsheet rows and shell shortcuts at once; the coverage test enforces it. [Source: docs/stories/epic15.story3-keyboard-coverage.md]
- ⌘⇧\ matches on `key: '|'` — macOS reports the shifted character (same US-layout convention the registry already uses for `?`).
- Icons are inline geometric SVGs (stroke currentColor): DESIGN bans emoji in chrome and names no icon set; no new deps allowed.
- Files: shared/types.ts + ipc-contract.ts, core/settings.ts + handlers.ts, renderer stores/rails.ts, actions/registry.ts, App.tsx, components/NavIcon.tsx + IdentityBadge.tsx, views/reader/VaultTree.tsx, styles.css.

### Testing

- Core (colocated vitest): rails round-trip per vault id in a temp app.db; distinct vaults isolated; default expanded; malformed value degrades.
- Renderer: rails store toggle→persist payload, load applies stored state, reset; registry test asserts both actions' ids/combos/hints and that run() flips the store; palette-coverage inherits the two rows; design-fidelity asserts 56px/0 widths + 160ms ease-out.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from DESIGN.md Addendum D1 (M4 polish cycle) | Dev agent (BMAD) |
| 2026-07-10 | 1.0 | Implemented + channel path driven against the real nimbus vault | Dev agent (BMAD) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Sequential gate: `npm run typecheck` clean (node+web) → `npm test` 71 files / 585 tests green (+17 new: 4 core rails persistence, 8 rails store, 2 registry/palette, 3 fidelity — shortcut-stroke cases folded into existing files) → `npm run build` clean → `npm run test:e2e` 18/18 (~20 s).
- Real-host drive (scratch vitest, removed before commit): `registerCoreHandlers` wired over the fake port pair against the LIVE nimbus vault (`_machine2/nimbus-vault`) + temp app.db — `settings.rails.get` defaults expanded, set→get round-trips both flags twice. PASS.

### Completion Notes List

- Per-vault persistence rides the EXISTING `app_settings` table (vault_id-scoped, story 9.2) — one `rails` JSON key via `appSettingGet/Set`; `meta` stays app-global (theme pattern untouched). No schema change.
- `settings.rails.get` degrades to expanded with no db/vault (picker pending); `set` requires the db (`requireDb`, same rule as projectRoots.set). Renderer persistence is best-effort — the toggle always applies for the session.
- ⌘⇧\ registers as combo key `'|'`: macOS keyboards report the SHIFTED character for the chord, and the matcher's shift-exactness only applies to letters/digits — stroke-level tests pin both `⌘\` and `⌘⇧\` (US-layout convention, same class as the existing bare `?`).
- Registry titles are live ("Collapse…"/"Expand…") — `appActions()` is rebuilt per call, so the palette row always says what the toggle will do; palette + cheatsheet coverage inherited from the story-15.3 single-registry contract, plus explicit assertions.
- Icons: 9 inline geometric SVGs (`NavIcon`) + shared `RailChevron` — DESIGN bans emoji in chrome, story bans new deps; stroke rides currentColor so the gold-rail active state needs zero extra CSS.
- Collapsed list keeps the element mounted (React unmount would kill the 160ms slide): width 0 + `margin-right: -12px` swallows the flex gap, `visibility: hidden` flips AFTER the slide (delayed transition) so the tree drops out of tab/a11y order; expanding flips visibility back instantly. Global reduced-motion rule kills all of it.
- Expand affordances while collapsed: sidebar keeps its header chevron on the 56px rail; the file list (at 0 width) gets a `.rail-expander` chevron floated top-left of the reader pane — plus ⌘⇧\ and the palette.
- Deviation: none against D1. Note: `?`-class US-layout assumption on the `|` key documented above; non-US layouts always have the palette + chevrons.

### File List

- src/shared/types.ts — `RailsCollapsed`
- src/shared/ipc-contract.ts — `settings.rails.get/set` channels (app-local contract evolution)
- src/core/settings.ts — `loadRailsCollapsed`/`saveRailsCollapsed` over `app_settings`
- src/core/settings.test.ts — per-vault persistence: defaults, round-trip, vault isolation, malformed degrade
- src/core/handlers.ts — rails handlers beside settings.theme
- src/renderer/src/stores/rails.ts — NEW: rails store (toggle/persist/load/reset)
- src/renderer/src/stores/rails.test.ts — NEW: store unit tests (stubbed bridge)
- src/renderer/src/actions/registry.ts — `action:toggle-sidebar` ⌘\ + `action:toggle-list` ⌘⇧\
- src/renderer/src/actions/registry.test.ts — combos/hints/run + palette rows
- src/renderer/src/actions/shortcuts.test.ts — stroke-level ⌘\ and ⌘⇧\ (`|`) matching
- src/renderer/src/components/NavIcon.tsx — NEW: nav glyphs + `RailChevron`
- src/renderer/src/components/IdentityBadge.tsx — collapsed dot+tooltip variant
- src/renderer/src/App.tsx — sidebar rail (chevron head, icon nav, dot badge, Route hidden), rails load/reset wiring, reader `.rail-expander`
- src/renderer/src/views/reader/VaultTree.tsx — header chevron + `.rail-collapsed`
- src/renderer/src/styles.css — rails section: 56px rail, list→0, 160ms ease-out, dots
- src/renderer/src/design-fidelity.test.ts — D1 rails assertions (widths, timing, gold dot)
- docs/stories/epic16.story2-collapsible-rails.md — this story
- docs/stories/sprint-status.yaml — epic-16 row (16-2)
