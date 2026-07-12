---
project: loredex-desktop
topic: ui-shell
type: design
date: '2026-07-12'
tags:
  - navigation
  - settings
  - typography
  - fonts
loredex: routed
---

# Design: App shell polish — nav groups, settings reskin, font control

## Summary

Three coupled shell improvements to the Electron/React renderer:

1. **Nav grouping** — the flat 9-item sidebar gains visual section headers.
2. **Settings reskin** — the flat vertical stack of sections becomes 4 tabs, each a
   responsive multi-column grid of cards.
3. **Font control** — a new Typography settings tab lets the user pick the app UI
   font and per-format note fonts (Title / Headings / Body / Code) from a bundled
   catalog of 14 fonts, with a live-preview picker popup.

All three ship in one plan. Font control lives inside the reskinned Settings, so 2
and 3 are coupled; nav grouping is independent but small.

## Constraints and principles

- **Offline-first.** The app runs with no network (local sqlite, local vault). Fonts
  are **bundled as woff2 and self-hosted via `@font-face`** — no Google CDN, no CSP
  relaxation, no external calls. All 14 fonts are OFL-licensed and redistributable.
- **Follow existing patterns.** Settings persist through IPC → sqlite `meta` table,
  applied live by stamping CSS custom properties on `<html>`/`:root` (exactly how the
  theme store works today). Font settings reuse this pattern.
- **No behavior change until opt-in.** Font defaults equal the current system fonts,
  so the app looks identical until the user picks something.
- **⌘1-9 is sacred.** The nav shortcut mapping is tied to `VIEW_ORDER` array position.
  Grouping must not renumber it — groups are purely visual.

## 1. Nav grouping

### Current state

- `renderer/src/actions/registry.ts` exports `VIEW_ORDER: ReadonlyArray<{ view, label }>`
  — 9 entries. It drives the sidebar nav, the ⌘1-9 shortcuts, and the command palette,
  all from this one array (order = shortcut number).
- `renderer/src/App.tsx` maps `VIEW_ORDER` into `<button class="nav-item">` rows inside
  `<nav aria-label="Views">`. Collapsed sidebar (56px rail) swaps labels for `<NavIcon>`.

### Change

Add an optional `group` field to each `VIEW_ORDER` entry:

```ts
export const VIEW_ORDER: ReadonlyArray<{ view: AppView; label: string; group: NavGroup }> = [
  { view: 'home',      label: 'Home',      group: 'Workspace' },
  { view: 'reader',    label: 'Reader',    group: 'Workspace' },
  { view: 'search',    label: 'Search',    group: 'Workspace' },
  { view: 'handoffs',  label: 'Handoffs',  group: 'Collaborate' },
  { view: 'contracts', label: 'Contracts', group: 'Collaborate' },
  { view: 'feed',      label: 'Activity',  group: 'Collaborate' },
  { view: 'atlas',     label: 'Atlas',     group: 'Knowledge' },
  { view: 'sync',      label: 'Sync',      group: 'System' },
  { view: 'settings',  label: 'Settings',  group: 'System' },
]
```

Note the order changed (Search moved up next to Home/Reader; Atlas moved after the
Collaborate views). **This renumbers ⌘1-9** to match the new visual order, which keeps
"shortcut = position on screen" true. Group order in the array: Workspace, Collaborate,
Knowledge, System.

`App.tsx` nav render walks the array and emits a group label whenever the group changes
from the previous item:

```tsx
{VIEW_ORDER.map((entry, i) => {
  const firstOfGroup = i === 0 || VIEW_ORDER[i - 1].group !== entry.group
  return (
    <Fragment key={entry.view}>
      {firstOfGroup && (
        sidebarCollapsed
          ? i > 0 && <div className="nav-group-rule" role="presentation" />
          : <div className="nav-group-label">{entry.group}</div>
      )}
      {/* existing nav-item button, unchanged */}
    </Fragment>
  )
})}
```

Collapsed 56px rail has no room for text, so a group boundary renders a hairline
`.nav-group-rule` divider instead (skipped before the first group).

### CSS (`styles.css`)

- `.nav-group-label` — small uppercase `--text-2` caption, letter-spacing, top margin;
  first one has no top margin.
- `.nav-group-rule` — 1px `--hairline` divider with vertical margin, shown only in the
  collapsed rail.

### Testing

Extend the existing registry/nav test: assert `VIEW_ORDER` length and that ⌘n index
equals array position after regrouping; assert every entry has a `group`; assert group
blocks are contiguous (no group appears in two non-adjacent runs).

## 2. Settings → tabs of multi-column cards

### Current state

`renderer/src/views/settings/SettingsView.tsx` renders a flat vertical stack:
`ThemeSection`, `IdentityForm`, `ContractsSection`, `DuplicatesSection`,
`ScopeSettings`, `GitHubSection`, `McpSection`. Each uses `.settings-section`.

### Change

`SettingsView` gains local tab state (`useState`, no routing) and renders a tab strip +
the active tab's card grid:

| Tab | Cards |
|-----|-------|
| **General** | Appearance (theme), Identity |
| **Typography** *(new)* | App font, Note fonts, (preview lives in the picker popup) |
| **Vault** | Scope, Contracts, Duplicates |
| **Integrations** | GitHub, MCP |

The existing section components are reused as-is inside cards — no rewrite of their
internals, only their wrapper class shifts from `.settings-section` to `.settings-card`
(kept backward-compatible: `.settings-card` inherits the section rules plus card
chrome). Each tab body is:

```tsx
<div className="settings-grid">{/* cards */}</div>
```

with CSS `grid-template-columns: repeat(auto-fill, minmax(320px, 1fr))` so it collapses
to one column on a narrow pane and flows to 2-3 columns when wide. `gap` and card
padding per the existing token system.

The one-gold-primary-per-view rule becomes one-gold-primary-per-tab (Save identity on
General; the Typography tab's apply is live so it needs no primary).

### CSS

- `.settings-tabs` — horizontal tab strip, active tab underlined in `--navy`, reuse the
  `seg-control` visual language or a simple underline row.
- `.settings-grid` — the responsive card grid above.
- `.settings-card` — white `--bg-card`, `--shadow-card`, `--hairline` border, radius,
  padding; contains an existing section's content.

### Testing

Render test: each tab shows its expected cards and hides the others; switching tabs
swaps content. No logic beyond tab state.

## 3. Font control

### Font catalog (`shared/fonts.ts`) — single source of truth

```ts
export type FontCategory = 'Display' | 'Sans' | 'Mono' | 'Arabic'
export interface FontDef {
  id: string          // 'dm-sans'
  name: string        // 'DM Sans'
  category: FontCategory
  stack: string       // "'DM Sans', <arabic-fallback>, sans-serif"
  files: string[]     // woff2 filenames bundled under assets/fonts/
}
export const FONTS: FontDef[]              // the 14
export const SYSTEM_FONT: FontDef          // id 'system' — current -apple-system stack, no files
export function fontById(id: string): FontDef
```

The 14 bundled fonts:

- **Display:** Geist Pixel, Press Start 2P, Archivo Black, Unbounded, Workbench
- **Sans:** DM Sans, Saira, Alexandria, Noto Sans, Sora
- **Mono:** Roboto Mono, Space Mono
- **Arabic:** Amiri (serif), Tajawal (sans)

Every non-Arabic `stack` includes an Arabic fallback (`'Tajawal'` for sans/display,
`'Amiri'` for serif-ish) before the generic family, so Arabic glyphs in a note render
with a real Arabic face regardless of which Latin font the role uses. `system` (the
default for every role) keeps today's `-apple-system…` stacks and bundles no files.

`@font-face` blocks are generated from `FONTS` (a small build-time or module-level CSS
string injected once), referencing `assets/fonts/*.woff2`. electron-vite fingerprints
and bundles these assets.

### Settings shape and persistence

New IPC channels mirroring theme:

```ts
'settings.fonts.get': { in: void; out: FontSettings }
'settings.fonts.set': { in: { fonts: FontSettings }; out: void }
```

```ts
interface FontSettings {
  app: string                     // font id → drives --font-ui
  note: {
    title: string                 // → --note-title  (.note-body h1)
    headings: string              // → --note-heading (.note-body h2, h3)
    body: string                  // → --note-body   (.note-body p, ul, ol, blockquote)
    code: string                  // → --note-code   (.note-body code, pre)
  }
}
```

Stored in sqlite `meta` under `settings:fonts` (JSON). Core handlers added next to the
existing `settings.theme.*` in `core/handlers.ts`. Default = all `'system'`.

### Store (`renderer/src/stores/fonts.ts`)

Zustand store modeled on the theme store: `load()`, `set(partial)`. `apply()` stamps
CSS vars on `:root`:

```
--font-ui     = fontById(app).stack
--note-title  = fontById(note.title).stack
--note-heading= fontById(note.headings).stack
--note-body   = fontById(note.body).stack
--note-code   = fontById(note.code).stack
```

`styles.css` `.note-body` rules switch from `var(--font-serif)` / `var(--font-mono)` /
inherited to the new per-role vars (with the current system stacks as the var default,
so unset = unchanged). `initFonts()` called once from `main.tsx` before first paint,
same as `initTheme()`.

### Typography tab UI

Two cards:

- **App font** card — one `FontControl` row (label "Interface" + current font name +
  "Change…" button that opens the picker for the `app` role).
- **Note fonts** card — four `FontControl` rows: Title, Headings, Body, Code.

`FontControl` is a labeled button showing the current font's name set in its own face;
clicking opens the shared picker popup.

### Preview picker popup (`renderer/src/views/settings/FontPicker.tsx`)

One reusable modal, opened with `{ role, currentId, onPick }`:

- **Left column:** the 14 fonts + System, grouped by category with `.nav-group-label`-style
  headers. Each row renders the font's own name in its own face. Selected row highlighted.
  Hover or arrow-key moves a "preview" cursor.
- **Right column:** a live **specimen** — a mini note showing a title line, a heading,
  a body paragraph (pangram + real prose), a code line, and one Arabic line
  (سطر تجريبي بالعربية). The specimen applies the previewed font to the slot that
  matches `role` (e.g. picking for `headings` restyles only the specimen's heading;
  picking for `app`/`body` restyles the body text). Updates live as the cursor moves.
- **Footer:** Cancel / Use this font. "Use this font" calls `onPick(id)` → store `set`
  → live apply → close. Esc cancels. Follows the existing `.modal-backdrop` pattern used
  by the handoff modals.

### Testing

- Catalog integrity: every `FontDef` has a non-empty `stack`; every non-system font lists
  at least one `files` entry; ids are unique; every category is represented.
- Fonts store: `set` then `get` round-trips through a fake IPC; `apply` writes the
  expected `--note-*` / `--font-ui` vars for a given `FontSettings`.
- FontPicker render: lists all fonts grouped; picking a font fires `onPick` with its id;
  the specimen slot for the given role reflects the selection.

## Files touched

**New**
- `shared/fonts.ts` — catalog + types
- `renderer/src/stores/fonts.ts` — store + `initFonts`
- `renderer/src/views/settings/FontPicker.tsx` — preview popup
- `renderer/src/views/settings/TypographySection.tsx` — the two Typography cards
- `renderer/src/assets/fonts/*.woff2` — bundled faces
- `renderer/src/assets/fonts.css` (or generated) — `@font-face` blocks

**Modified**
- `renderer/src/actions/registry.ts` — `group` field + reordered `VIEW_ORDER`
- `renderer/src/App.tsx` — nav group headers/rules
- `renderer/src/views/settings/SettingsView.tsx` — tabs + card grid
- `renderer/src/main.tsx` — call `initFonts()`
- `renderer/src/styles.css` — nav group styles, settings tabs/grid/card styles,
  `.note-body` per-role font vars, `@font-face` import
- `core/handlers.ts` — `settings.fonts.get/set` handlers
- `shared/ipc-contract.ts` — the two new channels + `FontSettings` type

## Out of scope (add later if wanted)

- Variable-font axis controls (weight/width sliders).
- Per-role font-size / line-height overrides.
- Per-vault font config (fonts are per-user, like theme).
- On-demand/lazy font loading — all 14 bundle up front (~1-3 MB, acceptable).
