# Story 16.3: Vault tree sections — Notability-style tinted rows

## Status

Done

## Story

**As a** vault reader,
**I want** the vault tree's top-level groups and each project to render as rounded, color-tinted section rows with their notes carrying the project color,
**so that** I can tell projects apart at a glance and collapse the ones I'm not working in, per DESIGN.md Addendum D1 "Vault tree sections (Notability-style)".

## Acceptance Criteria

1. Each top-level group (`_index`, `projects`) and each project renders a rounded section row: full-width pill (radius 8), tinted background, 11px caps label, solid 8px color dot, chevron to collapse.
2. Project colors are deterministic (hash of the name) from the D1 8-tint set — sage `#7C9A6D` · clay `#C07856` · slate `#6B7FA3` · moss `#8A8F55` · rose `#B07285` · sand `#B99B5F` · teal `#5F9490` · plum `#8D6E97`; same name → same tint on every launch.
3. Both themes as specced: row tint = the section color at 12% alpha (light) / 20% alpha (dark); the dot stays solid.
4. Notes under a project inherit a 2px left rail in the project color; selection keeps the gold left rail (gold budget: selection only).
5. Section rows collapse via their chevron; collapsed state persists PER VAULT (app.db `app_settings`, never the vault — state-placement rule).
6. DoD: build green; deterministic-color unit test (same name → same tint, distribution across the 8); collapsed-state persistence test; screenshot-free CSS assertions per the design-fidelity suite pattern.

## Tasks / Subtasks

- [x] Deterministic tints (AC: 2)
  - [x] `views/reader/sectionTint.ts`: `TREE_TINTS` (8 exact D1 hexes) + `sectionTint(name)` — FNV-1a 32-bit mod 8
  - [x] Unit test: palette verbatim, repeat-call determinism, pinned nimbus assignments (a hash change can't silently recolor vaults), 24 names cover all 8 tints, the 4 nimbus projects land on 4 different tints
- [x] Contract + core persistence (AC: 5)
  - [x] `TreeSectionsCollapsed { collapsed: string[] }` in shared/types.ts; `settings.treeSections.get/set` channels (app-local contract evolution)
  - [x] `loadTreeSectionsCollapsed`/`saveTreeSectionsCollapsed` in core/settings.ts over `appSettingGet/Set` (per-vault key `treeSections`, beside `rails`)
  - [x] Handlers beside settings.rails: get degrades to nothing-collapsed with no db/vault; set requires the db
  - [x] Persistence unit test: default, round-trip (incl. back to empty), vault isolation, malformed/non-string rows degrade
- [x] Renderer store (AC: 5)
  - [x] `stores/treeSections.ts`: `collapsed: string[]`, `toggle(path)` (persist best-effort), `load` (PORT_SWAPPED retry), `reset` — rails-store pattern
  - [x] App.tsx: load on start + reset/reload on vault change; store unit test with a stubbed bridge
- [x] Tree rendering (AC: 1, 4)
  - [x] `VaultTree.tsx`: `Branch` gains a `sections` level (`groups` at the top → `projects` inside the projects group → `none` deeper); `SectionNode` = pill button (dot + caps label + `RailChevron`), inline `--section-color`, children render only while expanded
  - [x] `RailChevron` gains `dir="down"` (expanded section)
  - [x] File rows under a project: `.tree-file-project` — 2px `var(--section-color)` rail, gold 4px on `aria-current` (padding keeps text flush at 16px either way)
- [x] Styles + fidelity (AC: 1, 3, 4, 6)
  - [x] styles.css D1 section block: radius 8, 11px caps, `color-mix` 12% / dark 20%, solid 8px dot, project rail, hover states
  - [x] design-fidelity: new 16.3 describe (pill recipe, 12%/20% tints, solid dot, project rail + gold selection); the >1px border sanction list gains the D1 project rail

## Dev Notes

- Addendum D1 "Vault tree sections (Notability-style)" is the binding spec: exact 8 hexes, 12%/20% alpha, solid dot, 2px project rail, selection stays gold. [Source: DESIGN.md#addendum-d1]
- Section levels: top-level dirs are group sections; dirs directly under the `projects` group are project sections; deeper dirs stay native `<details>` (story 2.1 keyboard support). Top-level files (e.g. `Start Here - Product.md`) stay plain rows.
- Group rows (`_index`, `projects`) take the same deterministic hash as projects — D1 gives every section row a tinted background + dot and only defines one palette, so one rule colors everything (no special-case hues).
- Tint delivery: the hex rides an inline `--section-color` on the section `<li>` and CSS-inherits to descendant file rows — the 12%/20% alpha and theming stay entirely in the stylesheet (`color-mix(... transparent)`), so light/dark need no JS.
- Hash is FNV-1a 32-bit (`Math.imul`, `>>>0`, mod 8): stable across launches/machines/insertion order; pinned-value tests make recoloring a deliberate act.
- State placement: collapsed sections are a UI pref → app.db `app_settings` (vault_id-scoped), never the vault; channels/handlers/store mirror `settings.rails.*` (story 16.2) including the no-db degrade and PORT_SWAPPED retry. [Source: architecture.md#state-placement]
- Selection cascade: `.tree-file[aria-current]` (14.x gold) sets only `border-left-color`; the project variant re-widens to 4px gold later in the sheet at equal specificity — order is load-bearing, the fidelity test pins the outcome.
- No new keyboard actions: D1 mandates only the chevron affordance for sections (rails keep ⌘\/⌘⇧\); no registry change.
- Files: shared/types.ts + ipc-contract.ts, core/settings.ts (+test) + handlers.ts, renderer stores/treeSections.ts (+test), views/reader/sectionTint.ts (+test) + VaultTree.tsx, components/NavIcon.tsx, App.tsx, styles.css, design-fidelity.test.ts.

### Testing

- Renderer: sectionTint unit test (determinism, pinned values, distribution across all 8); treeSections store test (toggle→persist whole set, load applies, degrade paths, reset); design-fidelity CSS assertions (screenshot-free, per the suite pattern).
- Core (colocated vitest): treeSections round-trip per vault id in a temp app.db; vault isolation; malformed degrade.
- Gate: typecheck (node+web), full app vitest run SEQUENTIALLY, production build, e2e release gate.

## Change Log

| Date | Version | Description | Author |
|---|---|---|---|
| 2026-07-10 | 0.1 | Drafted from DESIGN.md Addendum D1 (M4 polish cycle) | Dev agent (BMAD) |
| 2026-07-10 | 1.0 | Implemented + channel path driven against the real nimbus vault | Dev agent (BMAD) |

## Dev Agent Record

### Agent Model Used

Claude Fable 5 (claude-fable-5)

### Debug Log References

- Sequential gate: `npm run typecheck` clean (node+web) → `npm test` 73 files / 608 tests green (+23 new: 6 sectionTint, 8 treeSections store, 4 core persistence, 4 fidelity, +1 fidelity sanction case) → `npm run build` clean → `npm run test:e2e` 18/18 (~20 s).
- Real-host drive (scratch vitest, removed before commit): `registerCoreHandlers` over the fake port pair against the LIVE nimbus vault (`_machine2/nimbus-vault`) + temp app.db — `settings.treeSections.get` defaults to nothing collapsed, set→get round-trips twice; `vault.tree` confirms the section levels (`_index` + `projects` groups, the 4 nimbus projects). PASS.

### Completion Notes List

- Deterministic tints: FNV-1a of the section NAME (not path) mod 8 — the same project keeps its color even if the tree nesting changes. Real nimbus assignments: backend=slate, frontend=teal, mobile=sage, ai-engine=sand (4 projects → 4 distinct tints); pinned in the unit test so a hash/palette change is a conscious, reviewed recolor.
- Persistence rides the EXISTING `app_settings` table beside the `rails` key — one `treeSections` JSON key (`{ collapsed: string[] }` of section paths); no schema change; get degrades to nothing-collapsed with no db/vault, set requires the db (requireDb, rails rule).
- The tint reaches note rows by CSS custom-property inheritance: one inline `--section-color` per section `<li>`, everything else (12% light / 20% dark tint, solid dot, 2px rail) is stylesheet-only — themes switch with zero renderer logic.
- `.tree-file-project` keeps text flush with plain rows in both states: 2px rail + 14px padding = 4px slot + 12px padding = 16px; selection re-widens to the 4px gold rail (padding drops back to 12px), so gold stays the ONLY selection color (D1 gold budget).
- The design-fidelity >1px-border sanction list gained `2px solid var(--section-color)` (the D1 project rail) — the Don't-list test still fails any other wide border.
- Group rows hash with the same palette as projects (D1 defines one palette and gives every section row a dot + tint); deeper folders inside a project stay native `<details>` and their files keep the project rail (`inProject` recurses).
- Deviation: none against D1.

### File List

- src/shared/types.ts — `TreeSectionsCollapsed`
- src/shared/ipc-contract.ts — `settings.treeSections.get/set` channels (app-local contract evolution)
- src/core/settings.ts — `loadTreeSectionsCollapsed`/`saveTreeSectionsCollapsed` over `app_settings`
- src/core/settings.test.ts — persistence: default, round-trip, vault isolation, malformed degrade
- src/core/handlers.ts — treeSections handlers beside settings.rails
- src/renderer/src/views/reader/sectionTint.ts — NEW: D1 palette + FNV-1a `sectionTint`
- src/renderer/src/views/reader/sectionTint.test.ts — NEW: determinism + pinned values + distribution
- src/renderer/src/stores/treeSections.ts — NEW: collapsed-sections store (toggle/persist/load/reset)
- src/renderer/src/stores/treeSections.test.ts — NEW: store unit tests (stubbed bridge)
- src/renderer/src/views/reader/VaultTree.tsx — section rows (groups + projects), project rail plumbing
- src/renderer/src/components/NavIcon.tsx — `RailChevron` `down` direction
- src/renderer/src/App.tsx — treeSections load/reset wiring beside rails
- src/renderer/src/styles.css — D1 tree-section block (pill, tints, dot, project rail)
- src/renderer/src/design-fidelity.test.ts — 16.3 assertions + project-rail border sanction
- docs/stories/epic16.story3-vault-tree-sections.md — this story
- docs/stories/sprint-status.yaml — epic-16 row (16-3)
