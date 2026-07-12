# App Shell Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the sidebar nav into sections, reskin Settings into tabbed multi-column cards, and add app + per-note-format font control with a live-preview picker, using a bundled (offline) font catalog.

**Architecture:** New settings persist through the existing IPC → sqlite `meta` table seam and apply live by stamping CSS custom properties on `:root` — identical to the theme store. Fonts ship as bundled woff2 self-hosted via `@font-face` (no CDN). A single `shared/fonts.ts` catalog is the source of truth for the picker, apply logic, and the specimen preview.

**Tech Stack:** Electron + React 19, Zustand stores, electron-vite, better-sqlite3, Vitest.

## Global Constraints

- **Offline-only fonts:** bundle woff2 under `renderer/src/assets/fonts/`, self-host via `@font-face`. No `fonts.googleapis.com` / `gstatic.com` at runtime. No CSP changes.
- **Follow the theme pattern:** persistence via `core/settings.ts` (`meta` table, `settings:<key>`), IPC in `core/handlers.ts`, contract in `shared/ipc-contract.ts`, live apply by stamping CSS vars on `document.documentElement`.
- **Defaults are the current system fonts** — id `'system'` for every role. The app must look byte-identical until the user opts in.
- **⌘1-9 = on-screen position.** The shortcut number equals `VIEW_ORDER` array index; reordering for group contiguity intentionally reassigns which view gets which number. Do not decouple index from shortcut.
- **One gold primary per tab** (existing DESIGN rule), navy-outline secondaries elsewhere.
- Test runner: `npx vitest run <path>`. TypeScript strict — no `any`, explicit return types on exported functions.

---

### Task 1: Nav grouping

**Files:**
- Modify: `src/renderer/src/actions/registry.ts` (VIEW_ORDER)
- Modify: `src/renderer/src/App.tsx:182-206` (nav render)
- Modify: `src/renderer/src/styles.css` (nav group styles)
- Test: `src/renderer/src/actions/registry.test.ts` (create if absent) or extend `src/renderer/src/stores/rails.test.ts`'s sibling; use `src/renderer/src/actions/nav-groups.test.ts`

**Interfaces:**
- Produces: `NavGroup` type and `VIEW_ORDER: ReadonlyArray<{ view: AppView; label: string; group: NavGroup }>`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/actions/nav-groups.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { VIEW_ORDER } from './registry'

describe('VIEW_ORDER nav groups', () => {
  it('every entry has a group', () => {
    expect(VIEW_ORDER.every((e) => typeof e.group === 'string' && e.group.length > 0)).toBe(true)
  })

  it('groups are contiguous — no group appears in two separate runs', () => {
    const runs: string[] = []
    for (const e of VIEW_ORDER) if (runs[runs.length - 1] !== e.group) runs.push(e.group)
    expect(runs.length).toBe(new Set(runs).size)
  })

  it('keeps 9 views so ⌘1-9 stays fully bound', () => {
    expect(VIEW_ORDER).toHaveLength(9)
  })

  it('orders groups Workspace, Collaborate, Knowledge, System', () => {
    const seen = [...new Set(VIEW_ORDER.map((e) => e.group))]
    expect(seen).toEqual(['Workspace', 'Collaborate', 'Knowledge', 'System'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/actions/nav-groups.test.ts`
Expected: FAIL — `group` is undefined on entries.

- [ ] **Step 3: Add the group field and reorder VIEW_ORDER**

In `src/renderer/src/actions/registry.ts`, replace the `VIEW_ORDER` block (lines ~45-56):

```ts
export type NavGroup = 'Workspace' | 'Collaborate' | 'Knowledge' | 'System'

/** Sidebar order IS the shortcut order: ⌘1…⌘9 (AppView type ties the two).
 *  `group` is a visual section header only — the ⌘n number is the array index. */
export const VIEW_ORDER: ReadonlyArray<{ view: AppView; label: string; group: NavGroup }> = [
  { view: 'home', label: 'Home', group: 'Workspace' },
  { view: 'reader', label: 'Reader', group: 'Workspace' },
  { view: 'search', label: 'Search', group: 'Workspace' },
  { view: 'handoffs', label: 'Handoffs', group: 'Collaborate' },
  { view: 'contracts', label: 'Contracts', group: 'Collaborate' },
  { view: 'feed', label: 'Activity', group: 'Collaborate' },
  { view: 'atlas', label: 'Atlas', group: 'Knowledge' },
  { view: 'sync', label: 'Sync', group: 'System' },
  { view: 'settings', label: 'Settings', group: 'System' },
]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/actions/nav-groups.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Render group headers in App.tsx**

In `src/renderer/src/App.tsx`, add `Fragment` to the React import (line 6): `import { Fragment, useEffect } from 'react'`.

Replace the nav map (lines ~185-205) with:

```tsx
{VIEW_ORDER.map(({ view: v, label, group }, i) => {
  const firstOfGroup = i === 0 || VIEW_ORDER[i - 1].group !== group
  return (
    <Fragment key={v}>
      {firstOfGroup &&
        (sidebarCollapsed
          ? i > 0 && <div className="nav-group-rule" role="presentation" />
          : <div className="nav-group-label">{group}</div>)}
      <button
        type="button"
        className="nav-item"
        aria-current={view === v}
        title={`${label} (⌘${i + 1})`}
        aria-label={label}
        aria-keyshortcuts={`Meta+${i + 1}`}
        onClick={() => setView(v)}
      >
        {sidebarCollapsed ? <NavIcon view={v} /> : label}
        {v === 'handoffs' &&
          openInbound > 0 &&
          (sidebarCollapsed ? (
            <span className="nav-dot" title={`${openInbound} open`} />
          ) : (
            <span className="nav-badge">{openInbound}</span>
          ))}
      </button>
    </Fragment>
  )
})}
```

- [ ] **Step 6: Add CSS**

Append to `src/renderer/src/styles.css`:

```css
/* ── nav groups ─────────────────────────────────────────────────────────── */
.nav-group-label {
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--text-2);
  padding: 0 8px;
  margin: 14px 0 4px;
}
.nav-group-label:first-of-type {
  margin-top: 4px;
}
.nav-group-rule {
  height: 1px;
  background: var(--hairline);
  margin: 8px 8px;
}
```

- [ ] **Step 7: Typecheck + full renderer tests**

Run: `npx tsc --noEmit` then `npx vitest run src/renderer/src/actions`
Expected: no type errors; tests PASS.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/actions/registry.ts src/renderer/src/actions/nav-groups.test.ts src/renderer/src/App.tsx src/renderer/src/styles.css
git commit -m "feat(nav): group sidebar views into sections"
```

---

### Task 2: Settings tabs + card grid

**Files:**
- Modify: `src/renderer/src/views/settings/SettingsView.tsx`
- Modify: `src/renderer/src/styles.css` (tabs, grid, card)
- Test: `src/renderer/src/views/settings/SettingsView.test.tsx` (create)

**Interfaces:**
- Consumes: existing section components (`ThemeSection`, `IdentityForm`, `ContractsSection`, `DuplicatesSection`, `ScopeSettings`, `GitHubSection`, `McpSection`).
- Produces: nothing consumed by later tasks except a Typography tab slot (Task 6 fills it — for now it renders a placeholder card).

> Note: `@testing-library/react` — confirm it is a devDependency (`grep testing-library package.json`). If absent, install with `npm i -D @testing-library/react @testing-library/dom` before Step 1.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/views/settings/SettingsView.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

// the section components each fire IPC on mount; stub them to isolate tab logic
vi.mock('./ThemeSection', () => ({ ThemeSection: () => <div>Appearance-card</div> }))
vi.mock('./IdentityForm', () => ({ IdentityForm: () => <div>Identity-card</div> }))
vi.mock('./ContractsSection', () => ({ ContractsSection: () => <div>Contracts-card</div> }))
vi.mock('./DuplicatesSection', () => ({ DuplicatesSection: () => <div>Duplicates-card</div> }))
vi.mock('./ScopeSettings', () => ({ ScopeSettings: () => <div>Scope-card</div> }))
vi.mock('./GitHubSection', () => ({ GitHubSection: () => <div>GitHub-card</div> }))
vi.mock('./McpSection', () => ({ McpSection: () => <div>Mcp-card</div> }))
vi.mock('./TypographySection', () => ({ TypographySection: () => <div>Typography-card</div> }))

import { SettingsView } from './SettingsView'

describe('SettingsView tabs', () => {
  it('shows General cards by default and hides other tabs', () => {
    render(<SettingsView />)
    expect(screen.getByText('Appearance-card')).toBeTruthy()
    expect(screen.getByText('Identity-card')).toBeTruthy()
    expect(screen.queryByText('Scope-card')).toBeNull()
  })

  it('switches to the Vault tab on click', () => {
    render(<SettingsView />)
    fireEvent.click(screen.getByRole('tab', { name: 'Vault' }))
    expect(screen.getByText('Scope-card')).toBeTruthy()
    expect(screen.getByText('Contracts-card')).toBeTruthy()
    expect(screen.queryByText('Appearance-card')).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/views/settings/SettingsView.test.tsx`
Expected: FAIL — no tab roles / `TypographySection` module missing.

- [ ] **Step 3: Add a placeholder TypographySection**

Create `src/renderer/src/views/settings/TypographySection.tsx` (Task 6 replaces the body):

```tsx
export function TypographySection(): React.JSX.Element {
  return (
    <div className="settings-card">
      <h2 className="settings-title">Typography</h2>
      <p className="settings-hint">Font controls coming up.</p>
    </div>
  )
}
```

- [ ] **Step 4: Rewrite SettingsView with tabs + grid**

Replace `src/renderer/src/views/settings/SettingsView.tsx`:

```tsx
/**
 * Settings view — tabbed multi-column cards. Tabs hold cards in a responsive
 * grid (1 col narrow → 2-3 wide). Local tab state only; each section component
 * is reused unchanged inside a card. One gold primary per tab.
 */
import { useState } from 'react'
import { ContractsSection } from './ContractsSection'
import { DuplicatesSection } from './DuplicatesSection'
import { GitHubSection } from './GitHubSection'
import { IdentityForm } from './IdentityForm'
import { McpSection } from './McpSection'
import { ScopeSettings } from './ScopeSettings'
import { ThemeSection } from './ThemeSection'
import { TypographySection } from './TypographySection'

const TABS = ['General', 'Typography', 'Vault', 'Integrations'] as const
type Tab = (typeof TABS)[number]

export function SettingsView(): React.JSX.Element {
  const [tab, setTab] = useState<Tab>('General')

  return (
    <div className="settings">
      <div className="board-header">
        <span className="pane-list-title">Settings</span>
      </div>
      <div className="settings-tabs" role="tablist" aria-label="Settings sections">
        {TABS.map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            className="settings-tab"
            onClick={() => setTab(t)}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="settings-grid" role="tabpanel">
        {tab === 'General' && (
          <>
            <ThemeSection />
            <IdentityForm />
          </>
        )}
        {tab === 'Typography' && <TypographySection />}
        {tab === 'Vault' && (
          <>
            <ScopeSettings />
            <ContractsSection />
            <DuplicatesSection />
          </>
        )}
        {tab === 'Integrations' && (
          <>
            <GitHubSection />
            <McpSection />
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Make sections render as cards**

The section components currently wrap in `.settings-section`. Add card chrome by making `.settings-card` styles apply to `.settings-section` too (no component edits). Append to `src/renderer/src/styles.css`:

```css
/* ── settings tabs + card grid ──────────────────────────────────────────── */
.settings-tabs {
  display: flex;
  gap: 4px;
  border-bottom: 1px solid var(--hairline);
  padding: 0 16px;
  margin-bottom: 16px;
}
.settings-tab {
  appearance: none;
  background: none;
  border: none;
  padding: 8px 12px;
  font: inherit;
  color: var(--text-2);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.settings-tab[aria-selected='true'] {
  color: var(--text-1);
  border-bottom-color: var(--navy);
  font-weight: 600;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 16px;
  padding: 0 16px 24px;
  align-items: start;
}
.settings-card,
.settings-section {
  background: var(--bg-card);
  border: 1px solid var(--hairline);
  border-radius: 12px;
  box-shadow: var(--shadow-card);
  padding: 16px;
}
```

If `.settings-section` already sets background/border/padding elsewhere in the file, delete that older block so this one wins (search `.settings-section {`).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/views/settings/SettingsView.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 7: Typecheck**

Run: `npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/views/settings/SettingsView.tsx src/renderer/src/views/settings/TypographySection.tsx src/renderer/src/views/settings/SettingsView.test.tsx src/renderer/src/styles.css
git commit -m "feat(settings): tabbed multi-column card layout"
```

---

### Task 3: Font catalog + bundled faces

**Files:**
- Create: `src/shared/fonts.ts`
- Create: `scripts/fetch-fonts.sh`
- Create: `src/renderer/src/assets/fonts/*.woff2` (downloaded)
- Create: `src/renderer/src/assets/fonts.css` (`@font-face` blocks)
- Modify: `src/renderer/src/main.tsx` (import `fonts.css`)
- Test: `src/shared/fonts.test.ts`

**Interfaces:**
- Produces:
  - `type FontCategory = 'Display' | 'Sans' | 'Mono' | 'Arabic'`
  - `interface FontDef { id: string; name: string; category: FontCategory; stack: string; files: string[] }`
  - `const SYSTEM_FONT: FontDef` (id `'system'`)
  - `const FONTS: readonly FontDef[]` (system + 14)
  - `function fontById(id: string): FontDef` (falls back to `SYSTEM_FONT`)
  - `function fontsByCategory(): Array<{ category: FontCategory; fonts: FontDef[] }>`

- [ ] **Step 1: Write the failing test**

Create `src/shared/fonts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { FONTS, SYSTEM_FONT, fontById, fontsByCategory } from './fonts'

describe('font catalog', () => {
  it('has system + 14 fonts with unique ids', () => {
    expect(FONTS).toHaveLength(15)
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(15)
  })

  it('every non-system font bundles at least one file and has a stack', () => {
    for (const f of FONTS) {
      expect(f.stack.length).toBeGreaterThan(0)
      if (f.id !== 'system') expect(f.files.length).toBeGreaterThan(0)
    }
  })

  it('system font bundles no files', () => {
    expect(SYSTEM_FONT.id).toBe('system')
    expect(SYSTEM_FONT.files).toHaveLength(0)
  })

  it('every category is represented', () => {
    const cats = new Set(FONTS.map((f) => f.category))
    expect(cats).toEqual(new Set(['Sans', 'Display', 'Mono', 'Arabic']))
  })

  it('fontById falls back to system for unknown ids', () => {
    expect(fontById('nope').id).toBe('system')
    expect(fontById('dm-sans').name).toBe('DM Sans')
  })

  it('fontsByCategory groups all fonts', () => {
    const total = fontsByCategory().reduce((n, g) => n + g.fonts.length, 0)
    expect(total).toBe(FONTS.length)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/shared/fonts.test.ts`
Expected: FAIL — module missing.

- [ ] **Step 3: Write the catalog**

Create `src/shared/fonts.ts`:

```ts
/**
 * Font catalog — single source of truth for the picker, the live apply, and the
 * specimen preview. Fonts are bundled woff2 (offline). Every non-Arabic stack
 * lists an Arabic fallback so Arabic glyphs render with a real face regardless
 * of the Latin font chosen for a role. `system` = today's OS stacks, no files.
 */

export type FontCategory = 'Sans' | 'Display' | 'Mono' | 'Arabic'

export interface FontDef {
  id: string
  name: string
  category: FontCategory
  /** CSS font-family value applied to the role */
  stack: string
  /** woff2 filenames bundled under assets/fonts/ (empty for system) */
  files: string[]
}

const AR_SANS = "'Tajawal'"
const AR_SERIF = "'Amiri'"

export const SYSTEM_FONT: FontDef = {
  id: 'system',
  name: 'System',
  category: 'Sans',
  stack: `-apple-system, BlinkMacSystemFont, 'SF Pro Text', ${AR_SANS}, sans-serif`,
  files: [],
}

export const FONTS: readonly FontDef[] = [
  SYSTEM_FONT,
  // Sans
  { id: 'dm-sans', name: 'DM Sans', category: 'Sans', stack: `'DM Sans', ${AR_SANS}, sans-serif`, files: ['dm-sans-400.woff2', 'dm-sans-700.woff2'] },
  { id: 'sora', name: 'Sora', category: 'Sans', stack: `'Sora', ${AR_SANS}, sans-serif`, files: ['sora-400.woff2', 'sora-700.woff2'] },
  { id: 'saira', name: 'Saira', category: 'Sans', stack: `'Saira', ${AR_SANS}, sans-serif`, files: ['saira-400.woff2', 'saira-700.woff2'] },
  { id: 'noto-sans', name: 'Noto Sans', category: 'Sans', stack: `'Noto Sans', ${AR_SANS}, sans-serif`, files: ['noto-sans-400.woff2', 'noto-sans-700.woff2'] },
  { id: 'alexandria', name: 'Alexandria', category: 'Sans', stack: `'Alexandria', ${AR_SANS}, sans-serif`, files: ['alexandria-400.woff2', 'alexandria-700.woff2'] },
  // Display
  { id: 'archivo-black', name: 'Archivo Black', category: 'Display', stack: `'Archivo Black', ${AR_SANS}, sans-serif`, files: ['archivo-black-400.woff2'] },
  { id: 'unbounded', name: 'Unbounded', category: 'Display', stack: `'Unbounded', ${AR_SANS}, sans-serif`, files: ['unbounded-400.woff2', 'unbounded-700.woff2'] },
  { id: 'workbench', name: 'Workbench', category: 'Display', stack: `'Workbench', ${AR_SANS}, sans-serif`, files: ['workbench-400.woff2'] },
  { id: 'press-start-2p', name: 'Press Start 2P', category: 'Display', stack: `'Press Start 2P', ${AR_SANS}, monospace`, files: ['press-start-2p-400.woff2'] },
  { id: 'geist-pixel', name: 'Geist Pixel', category: 'Display', stack: `'Geist Pixel', ${AR_SANS}, monospace`, files: ['geist-pixel-400.woff2'] },
  // Mono
  { id: 'roboto-mono', name: 'Roboto Mono', category: 'Mono', stack: `'Roboto Mono', ${AR_SANS}, monospace`, files: ['roboto-mono-400.woff2', 'roboto-mono-700.woff2'] },
  { id: 'space-mono', name: 'Space Mono', category: 'Mono', stack: `'Space Mono', ${AR_SANS}, monospace`, files: ['space-mono-400.woff2', 'space-mono-700.woff2'] },
  // Arabic
  { id: 'tajawal', name: 'Tajawal', category: 'Arabic', stack: `'Tajawal', sans-serif`, files: ['tajawal-400.woff2', 'tajawal-700.woff2'] },
  { id: 'amiri', name: 'Amiri', category: 'Arabic', stack: `'Amiri', ${AR_SERIF}, serif`, files: ['amiri-400.woff2', 'amiri-700.woff2'] },
]

export function fontById(id: string): FontDef {
  return FONTS.find((f) => f.id === id) ?? SYSTEM_FONT
}

const CATEGORY_ORDER: FontCategory[] = ['Sans', 'Display', 'Mono', 'Arabic']

export function fontsByCategory(): Array<{ category: FontCategory; fonts: FontDef[] }> {
  return CATEGORY_ORDER.map((category) => ({
    category,
    fonts: FONTS.filter((f) => f.category === category),
  }))
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/shared/fonts.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Write the font-fetch script**

Create `scripts/fetch-fonts.sh` (downloads woff2 from Google Fonts into the assets dir; run once at build-authoring time, the woff2 are then committed):

```bash
#!/usr/bin/env bash
# Fetch bundled woff2 for the catalog. Requires curl. Google Fonts serves woff2
# to a modern UA; we grab the latin (+ arabic) subset URL from the css2 API.
set -euo pipefail
OUT="src/renderer/src/assets/fonts"
mkdir -p "$OUT"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36'

# family|weights|outbase  (one line per weight → outbase-<weight>.woff2)
grab() {
  local family="$1" weight="$2" out="$3"
  local css url
  css=$(curl -sfH "User-Agent: $UA" "https://fonts.googleapis.com/css2?family=${family}:wght@${weight}&display=swap")
  # last woff2 url in the response = the widest (latin) subset for that weight
  url=$(printf '%s' "$css" | grep -oE "https://[^)]+\.woff2" | tail -1)
  [ -n "$url" ] || { echo "no url for $family $weight" >&2; exit 1; }
  curl -sfL "$url" -o "$OUT/$out-$weight.woff2"
  echo "  $out-$weight.woff2"
}

grab "DM+Sans" 400 dm-sans;          grab "DM+Sans" 700 dm-sans
grab "Sora" 400 sora;                grab "Sora" 700 sora
grab "Saira" 400 saira;              grab "Saira" 700 saira
grab "Noto+Sans" 400 noto-sans;      grab "Noto+Sans" 700 noto-sans
grab "Alexandria" 400 alexandria;    grab "Alexandria" 700 alexandria
grab "Archivo+Black" 400 archivo-black
grab "Unbounded" 400 unbounded;      grab "Unbounded" 700 unbounded
grab "Workbench" 400 workbench
grab "Press+Start+2P" 400 press-start-2p
grab "Geist+Pixel" 400 geist-pixel
grab "Roboto+Mono" 400 roboto-mono;  grab "Roboto+Mono" 700 roboto-mono
grab "Space+Mono" 400 space-mono;    grab "Space+Mono" 700 space-mono
grab "Tajawal" 400 tajawal;          grab "Tajawal" 700 tajawal
grab "Amiri" 400 amiri;              grab "Amiri" 700 amiri
echo "done"
```

- [ ] **Step 6: Run the fetch script**

Run: `chmod +x scripts/fetch-fonts.sh && ./scripts/fetch-fonts.sh`
Expected: 24 `.woff2` files in `src/renderer/src/assets/fonts/`. Verify: `ls src/renderer/src/assets/fonts/ | wc -l` → `24`.

If a family fails (Geist Pixel / Workbench are newer — the css2 API may name them differently), open `https://fonts.google.com/specimen/<Name>`, download the woff2 manually, and place it as `<outbase>-400.woff2`.

- [ ] **Step 7: Author fonts.css (@font-face)**

Create `src/renderer/src/assets/fonts.css`. One block per file; `font-weight` matches the filename weight. Example blocks (write all 24, following this shape — family name must match the catalog `stack` family exactly):

```css
@font-face { font-family: 'DM Sans'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/dm-sans-400.woff2') format('woff2'); }
@font-face { font-family: 'DM Sans'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/dm-sans-700.woff2') format('woff2'); }
@font-face { font-family: 'Sora'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/sora-400.woff2') format('woff2'); }
@font-face { font-family: 'Sora'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/sora-700.woff2') format('woff2'); }
@font-face { font-family: 'Saira'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/saira-400.woff2') format('woff2'); }
@font-face { font-family: 'Saira'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/saira-700.woff2') format('woff2'); }
@font-face { font-family: 'Noto Sans'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/noto-sans-400.woff2') format('woff2'); }
@font-face { font-family: 'Noto Sans'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/noto-sans-700.woff2') format('woff2'); }
@font-face { font-family: 'Alexandria'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/alexandria-400.woff2') format('woff2'); }
@font-face { font-family: 'Alexandria'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/alexandria-700.woff2') format('woff2'); }
@font-face { font-family: 'Archivo Black'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/archivo-black-400.woff2') format('woff2'); }
@font-face { font-family: 'Unbounded'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/unbounded-400.woff2') format('woff2'); }
@font-face { font-family: 'Unbounded'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/unbounded-700.woff2') format('woff2'); }
@font-face { font-family: 'Workbench'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/workbench-400.woff2') format('woff2'); }
@font-face { font-family: 'Press Start 2P'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/press-start-2p-400.woff2') format('woff2'); }
@font-face { font-family: 'Geist Pixel'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/geist-pixel-400.woff2') format('woff2'); }
@font-face { font-family: 'Roboto Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/roboto-mono-400.woff2') format('woff2'); }
@font-face { font-family: 'Roboto Mono'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/roboto-mono-700.woff2') format('woff2'); }
@font-face { font-family: 'Space Mono'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/space-mono-400.woff2') format('woff2'); }
@font-face { font-family: 'Space Mono'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/space-mono-700.woff2') format('woff2'); }
@font-face { font-family: 'Tajawal'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/tajawal-400.woff2') format('woff2'); }
@font-face { font-family: 'Tajawal'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/tajawal-700.woff2') format('woff2'); }
@font-face { font-family: 'Amiri'; font-style: normal; font-weight: 400; font-display: swap; src: url('./fonts/amiri-400.woff2') format('woff2'); }
@font-face { font-family: 'Amiri'; font-style: normal; font-weight: 700; font-display: swap; src: url('./fonts/amiri-700.woff2') format('woff2'); }
```

- [ ] **Step 8: Import fonts.css**

In `src/renderer/src/main.tsx`, add above `import './styles.css'`:

```ts
import './assets/fonts.css'
```

- [ ] **Step 9: Verify the app builds and fonts load**

Run: `npm run build` (or `npx electron-vite build`).
Expected: build succeeds; the woff2 are emitted into the renderer bundle (grep the build output dir for `.woff2`).

- [ ] **Step 10: Commit**

```bash
git add src/shared/fonts.ts src/shared/fonts.test.ts scripts/fetch-fonts.sh src/renderer/src/assets/fonts src/renderer/src/assets/fonts.css src/renderer/src/main.tsx
git commit -m "feat(fonts): bundled offline font catalog + faces"
```

---

### Task 4: Font settings persistence (core + IPC contract)

**Files:**
- Create: `src/shared/font-settings.ts` (type + default + validator)
- Modify: `src/shared/ipc-contract.ts` (two channels)
- Modify: `src/core/settings.ts` (load/save)
- Modify: `src/core/handlers.ts:628-634` area (register handlers)
- Test: `src/core/settings.test.ts` (extend)

**Interfaces:**
- Produces:
  - `interface FontSettings { app: string; note: { title: string; headings: string; body: string; code: string } }`
  - `const DEFAULT_FONT_SETTINGS: FontSettings` (all `'system'`)
  - `function isFontSettings(v: unknown): v is FontSettings`
  - `loadFontSettings(): FontSettings`, `saveFontSettings(s: FontSettings): void`
  - IPC: `'settings.fonts.get': { in: void; out: FontSettings }`, `'settings.fonts.set': { in: { fonts: FontSettings }; out: void }`

- [ ] **Step 1: Write the failing test**

Append to `src/core/settings.test.ts` (mirror the theme tests near line 33-48; use the file's existing setup harness):

```ts
import { loadFontSettings, saveFontSettings } from './settings'
import { DEFAULT_FONT_SETTINGS } from '../shared/font-settings'

describe('font settings', () => {
  it('defaults to all-system', () => {
    expect(loadFontSettings()).toEqual(DEFAULT_FONT_SETTINGS)
  })

  it('round-trips a saved value', () => {
    const next = { app: 'dm-sans', note: { title: 'unbounded', headings: 'sora', body: 'dm-sans', code: 'space-mono' } }
    saveFontSettings(next)
    expect(loadFontSettings()).toEqual(next)
  })

  it('ignores a malformed stored value', () => {
    saveFontSettings({ app: 'dm-sans' } as never) // saveFontSettings validates? no — test load guard:
    // force a bad raw value through the same key, then expect the default back
  })
})
```

> Replace the third test body with the file's existing low-level `writeKey`/`metaSet` helper if exported; otherwise drop the third test and rely on `isFontSettings` unit-tested in Step 2b. Keep only round-trip + default if the harness makes bad-value injection awkward.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/core/settings.test.ts`
Expected: FAIL — `loadFontSettings` / `DEFAULT_FONT_SETTINGS` missing.

- [ ] **Step 3: Write the shared type + validator**

Create `src/shared/font-settings.ts`:

```ts
/** Per-user font preferences. Values are font ids from the catalog (shared/fonts). */
export interface FontSettings {
  app: string
  note: { title: string; headings: string; body: string; code: string }
}

export const DEFAULT_FONT_SETTINGS: FontSettings = {
  app: 'system',
  note: { title: 'system', headings: 'system', body: 'system', code: 'system' },
}

export function isFontSettings(v: unknown): v is FontSettings {
  if (typeof v !== 'object' || v === null) return false
  const s = v as Record<string, unknown>
  if (typeof s.app !== 'string') return false
  const n = s.note as Record<string, unknown> | undefined
  return (
    typeof n === 'object' &&
    n !== null &&
    typeof n.title === 'string' &&
    typeof n.headings === 'string' &&
    typeof n.body === 'string' &&
    typeof n.code === 'string'
  )
}
```

- [ ] **Step 3b (optional): validator unit test**

Add to `src/shared/font-settings.test.ts` (create):

```ts
import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_SETTINGS, isFontSettings } from './font-settings'

describe('isFontSettings', () => {
  it('accepts the default', () => expect(isFontSettings(DEFAULT_FONT_SETTINGS)).toBe(true))
  it('rejects partials', () => expect(isFontSettings({ app: 'dm-sans' })).toBe(false))
  it('rejects non-objects', () => expect(isFontSettings(null)).toBe(false))
})
```

Run: `npx vitest run src/shared/font-settings.test.ts` → PASS.

- [ ] **Step 4: Add core load/save**

In `src/core/settings.ts`, after the theme block (~line 86), add:

```ts
// ── Font preferences (app + per-note-format) ────────────────────────────────
import { DEFAULT_FONT_SETTINGS, isFontSettings, type FontSettings } from '../shared/font-settings'

export function loadFontSettings(): FontSettings {
  const raw = readJsonKey('fonts')
  return isFontSettings(raw) ? raw : DEFAULT_FONT_SETTINGS
}

export function saveFontSettings(fonts: FontSettings): void {
  writeKey('fonts', JSON.stringify(fonts))
}
```

Move the `import` to the top with the other imports (TypeScript hoists but keep the file clean — put it beside `import { isThemeSetting, type ThemeSetting } from '../shared/theme'`).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run src/core/settings.test.ts`
Expected: PASS.

- [ ] **Step 6: Add the IPC contract**

In `src/shared/ipc-contract.ts`, after the `settings.theme.*` lines (~115), add:

```ts
  /** app-local: per-user font preferences (app UI + per-note-format), applied
   *  renderer-side by stamping CSS vars — same seam as theme. */
  'settings.fonts.get': { in: void; out: FontSettings }
  'settings.fonts.set': { in: { fonts: FontSettings }; out: void }
```

Add the import at the top of the file (beside the `ThemeSetting` import):

```ts
import type { FontSettings } from './font-settings'
```

- [ ] **Step 7: Register the handlers**

In `src/core/handlers.ts`, after the `settings.theme.set` handler (line ~634), add:

```ts
  // Font preferences: per-user app state, applied renderer-side (like theme).
  ipc.register('settings.fonts.get', () => loadFontSettings())
  ipc.register('settings.fonts.set', ({ fonts }) => {
    if (!isFontSettings(fonts)) throw ipcError('INTERNAL', 'invalid font settings')
    saveFontSettings(fonts)
  })
```

Add to the existing settings import from `./settings` (find `loadThemeSetting`): include `loadFontSettings, saveFontSettings`. Add `isFontSettings` to the import from `../shared/font-settings` (create the import if none exists).

- [ ] **Step 8: Typecheck + core tests**

Run: `npx tsc --noEmit && npx vitest run src/core/settings.test.ts src/shared/font-settings.test.ts`
Expected: no type errors; PASS.

- [ ] **Step 9: Commit**

```bash
git add src/shared/font-settings.ts src/shared/font-settings.test.ts src/shared/ipc-contract.ts src/core/settings.ts src/core/settings.test.ts src/core/handlers.ts
git commit -m "feat(fonts): persist font settings through the app.db seam"
```

---

### Task 5: Fonts store + live apply

**Files:**
- Create: `src/renderer/src/stores/fonts.ts`
- Modify: `src/renderer/src/main.tsx` (call `initFonts`)
- Modify: `src/renderer/src/styles.css` (note-body per-role vars)
- Test: `src/renderer/src/stores/fonts.test.ts`

**Interfaces:**
- Consumes: `fontById` (Task 3), `FontSettings`/`DEFAULT_FONT_SETTINGS` (Task 4), `invoke` (`../api`).
- Produces: `useFonts` store with `settings: FontSettings`, `loaded: boolean`, `load(): Promise<void>`, `set(next: FontSettings): Promise<void>`; `applyFonts(s: FontSettings): void`; `initFonts(): void`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/stores/fonts.test.ts`:

```ts
import { describe, expect, it, beforeEach } from 'vitest'
import { applyFonts } from './fonts'
import { fontById } from '../../../shared/fonts'
import { DEFAULT_FONT_SETTINGS } from '../../../shared/font-settings'

describe('applyFonts', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('stamps every role var from the settings', () => {
    applyFonts({ app: 'dm-sans', note: { title: 'unbounded', headings: 'sora', body: 'dm-sans', code: 'space-mono' } })
    const root = document.documentElement.style
    expect(root.getPropertyValue('--font-ui')).toBe(fontById('dm-sans').stack)
    expect(root.getPropertyValue('--note-title')).toBe(fontById('unbounded').stack)
    expect(root.getPropertyValue('--note-heading')).toBe(fontById('sora').stack)
    expect(root.getPropertyValue('--note-body')).toBe(fontById('dm-sans').stack)
    expect(root.getPropertyValue('--note-code')).toBe(fontById('space-mono').stack)
  })

  it('defaults resolve to the system stack', () => {
    applyFonts(DEFAULT_FONT_SETTINGS)
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toBe(fontById('system').stack)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/stores/fonts.test.ts`
Expected: FAIL — module missing. (Vitest renderer config provides jsdom — confirm `environment: 'jsdom'` in `vitest.config.ts`; if node, add `// @vitest-environment jsdom` atop the test.)

- [ ] **Step 3: Write the store**

Create `src/renderer/src/stores/fonts.ts` (mirrors `stores/settings.ts` theme store):

```ts
/**
 * Font store: per-user app + per-note-format fonts, persisted core-side and
 * applied live by stamping CSS vars on :root — same shape as the theme store.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { DEFAULT_FONT_SETTINGS, type FontSettings } from '../../../shared/font-settings'
import { fontById } from '../../../shared/fonts'
import { invoke } from '../api'

export function applyFonts(s: FontSettings): void {
  const root = document.documentElement.style
  root.setProperty('--font-ui', fontById(s.app).stack)
  root.setProperty('--note-title', fontById(s.note.title).stack)
  root.setProperty('--note-heading', fontById(s.note.headings).stack)
  root.setProperty('--note-body', fontById(s.note.body).stack)
  root.setProperty('--note-code', fontById(s.note.code).stack)
}

interface FontState {
  settings: FontSettings
  loaded: boolean
  load(): Promise<void>
  set(next: FontSettings): Promise<void>
}

export const useFonts = create<FontState>((set, get) => ({
  settings: DEFAULT_FONT_SETTINGS,
  loaded: false,

  async load() {
    try {
      const settings = await invoke('settings.fonts.get', undefined)
      set({ settings, loaded: true })
      applyFonts(settings)
    } catch (e) {
      if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load()
      set({ loaded: true })
    }
  },

  async set(next) {
    set({ settings: next })
    applyFonts(next)
    try {
      await invoke('settings.fonts.set', { fonts: next })
    } catch {
      /* stays applied this session; next launch re-reads storage */
    }
  },
}))

/** Startup wiring (main.tsx, before first paint): apply defaults, then load. */
export function initFonts(): void {
  applyFonts(useFonts.getState().settings)
  void useFonts.getState().load()
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/stores/fonts.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire initFonts in main.tsx**

In `src/renderer/src/main.tsx`, beside `initTheme()` (line ~8):

```ts
import { initFonts } from './stores/fonts'
// ...
initTheme()
initFonts()
```

- [ ] **Step 6: Point note-body CSS at the role vars**

In `src/renderer/src/styles.css`, add fallback var defaults to `:root` (beside `--font-ui`, line ~42):

```css
  --note-title: var(--font-serif);
  --note-heading: var(--font-serif);
  --note-body: var(--font-ui);
  --note-code: var(--font-mono);
```

Then change the `.note-body` rules (lines ~1132-1164):

```css
.note-body {
  font-family: var(--note-body);
  font-size: 14px;
  line-height: 1.6;
}
.note-body h1 {
  font-family: var(--note-title);
  font-size: 22px;
}
.note-body h2,
.note-body h3 {
  font-family: var(--note-heading);
}
.note-body h1,
.note-body h2,
.note-body h3 {
  font-weight: 600;
  margin: 24px 0 8px;
}
.note-body code {
  font-family: var(--note-code);
  /* keep the rest of the existing code rule unchanged */
}
```

Keep the existing `.note-body pre` etc.; only the `font-family` sources change. Verify `.note-body pre code` inherits `--note-code` (it does via `code`).

- [ ] **Step 7: Typecheck + tests + build**

Run: `npx tsc --noEmit && npx vitest run src/renderer/src/stores/fonts.test.ts && npm run build`
Expected: clean.

- [ ] **Step 8: Commit**

```bash
git add src/renderer/src/stores/fonts.ts src/renderer/src/stores/fonts.test.ts src/renderer/src/main.tsx src/renderer/src/styles.css
git commit -m "feat(fonts): live-apply font settings via CSS vars"
```

---

### Task 6: Font picker popup + Typography tab

**Files:**
- Create: `src/renderer/src/views/settings/FontPicker.tsx`
- Rewrite: `src/renderer/src/views/settings/TypographySection.tsx`
- Modify: `src/renderer/src/styles.css` (picker + specimen + control styles)
- Test: `src/renderer/src/views/settings/FontPicker.test.tsx`

**Interfaces:**
- Consumes: `fontsByCategory`, `fontById`, `FontDef` (Task 3); `useFonts` (Task 5); `FontSettings` (Task 4).
- Produces: `<FontPicker open role currentId onPick onClose />` and the real `<TypographySection />`.
- `type FontRole = 'app' | 'title' | 'headings' | 'body' | 'code'`.

- [ ] **Step 1: Write the failing test**

Create `src/renderer/src/views/settings/FontPicker.test.tsx`:

```tsx
import { render, screen, fireEvent } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { FontPicker } from './FontPicker'

describe('FontPicker', () => {
  it('lists catalog fonts grouped by category', () => {
    render(<FontPicker open role="body" currentId="system" onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByText('DM Sans')).toBeTruthy()
    expect(screen.getByText('Roboto Mono')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sans' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Arabic' })).toBeTruthy()
  })

  it('fires onPick with the chosen id and closes', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<FontPicker open role="headings" currentId="system" onPick={onPick} onClose={onClose} />)
    fireEvent.click(screen.getByText('Sora'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this font' }))
    expect(onPick).toHaveBeenCalledWith('sora')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<FontPicker open={false} role="body" currentId="system" onPick={() => {}} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/renderer/src/views/settings/FontPicker.test.tsx`
Expected: FAIL — module missing.

- [ ] **Step 3: Write FontPicker**

Create `src/renderer/src/views/settings/FontPicker.tsx` (modal pattern from `ShortcutCheatsheet.tsx` — `.modal-backdrop`, Escape, mousedown stopPropagation):

```tsx
/**
 * Font picker popup: left = the catalog grouped by category, each row set in
 * its own face; right = a live specimen rendering a mini note with the hovered
 * / selected font applied to the slot that matches `role`. Select → onPick.
 */
import { useState } from 'react'
import { fontById, fontsByCategory, type FontDef } from '../../../../shared/fonts'

export type FontRole = 'app' | 'title' | 'headings' | 'body' | 'code'

interface Props {
  open: boolean
  role: FontRole
  currentId: string
  onPick(id: string): void
  onClose(): void
}

export function FontPicker({ open, role, currentId, onPick, onClose }: Props): React.JSX.Element | null {
  const [selected, setSelected] = useState(currentId)
  if (!open) return null
  const preview = fontById(selected).stack

  // which specimen slot the chosen font restyles
  const titleFont = role === 'title' ? preview : undefined
  const headingFont = role === 'headings' ? preview : undefined
  const bodyFont = role === 'body' || role === 'app' ? preview : undefined
  const codeFont = role === 'code' ? preview : undefined

  return (
    // biome-ignore lint: backdrop click-to-dismiss; keyboard path is Escape
    <div className="modal-backdrop" onMouseDown={onClose}>
      <div
        className="modal font-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose a font"
        tabIndex={-1}
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.stopPropagation()
            onClose()
          }
        }}
      >
        <h2 className="modal-title">Choose a font</h2>
        <div className="font-picker-body">
          <div className="font-list">
            {fontsByCategory().map(({ category, fonts }) => (
              <section key={category} className="font-cat">
                <h3 className="nav-group-label">{category}</h3>
                {fonts.map((f: FontDef) => (
                  <button
                    key={f.id}
                    type="button"
                    className="font-row"
                    aria-pressed={selected === f.id}
                    style={{ fontFamily: f.stack }}
                    onMouseEnter={() => setSelected(f.id)}
                    onClick={() => setSelected(f.id)}
                  >
                    {f.name}
                  </button>
                ))}
              </section>
            ))}
          </div>
          <div className="font-specimen">
            <div className="note-body">
              <h1 style={titleFont ? { fontFamily: titleFont } : undefined}>The Quick Brown Fox</h1>
              <h2 style={headingFont ? { fontFamily: headingFont } : undefined}>Jumps Over the Lazy Dog</h2>
              <p style={bodyFont ? { fontFamily: bodyFont } : undefined}>
                Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs — 0123456789.
              </p>
              <p dir="rtl" style={bodyFont ? { fontFamily: bodyFont } : undefined}>
                نص تجريبي بالعربية لمعاينة الخط
              </p>
              <pre>
                <code style={codeFont ? { fontFamily: codeFont } : undefined}>const answer = 42</code>
              </pre>
            </div>
          </div>
        </div>
        <div className="modal-footer">
          <button type="button" className="button-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className="button-primary"
            onClick={() => {
              onPick(selected)
              onClose()
            }}
          >
            Use this font
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/renderer/src/views/settings/FontPicker.test.tsx`
Expected: PASS (3 tests).

- [ ] **Step 5: Rewrite TypographySection**

Replace `src/renderer/src/views/settings/TypographySection.tsx`:

```tsx
/**
 * Typography settings: app UI font + per-note-format fonts. Each row opens the
 * live-preview FontPicker; the chosen id is persisted through the fonts store
 * (live apply). Two cards — App font, Note fonts.
 */
import { useEffect, useState } from 'react'
import { fontById } from '../../../../shared/fonts'
import { useFonts } from '../../stores/fonts'
import { FontPicker, type FontRole } from './FontPicker'

const NOTE_ROLES: Array<{ role: FontRole; label: string }> = [
  { role: 'title', label: 'Title' },
  { role: 'headings', label: 'Headings' },
  { role: 'body', label: 'Body' },
  { role: 'code', label: 'Code' },
]

export function TypographySection(): React.JSX.Element {
  const settings = useFonts((s) => s.settings)
  const loaded = useFonts((s) => s.loaded)
  const load = useFonts((s) => s.load)
  const setFonts = useFonts((s) => s.set)
  const [picking, setPicking] = useState<FontRole | null>(null)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  const idFor = (role: FontRole): string =>
    role === 'app' ? settings.app : settings.note[role]

  const pick = (role: FontRole, id: string): void => {
    if (role === 'app') void setFonts({ ...settings, app: id })
    else void setFonts({ ...settings, note: { ...settings.note, [role]: id } })
  }

  const Row = ({ role, label }: { role: FontRole; label: string }): React.JSX.Element => {
    const font = fontById(idFor(role))
    return (
      <div className="toggle-row">
        <span>{label}</span>
        <button type="button" className="button-secondary font-pick-btn" onClick={() => setPicking(role)}>
          <span style={{ fontFamily: font.stack }}>{font.name}</span>
        </button>
      </div>
    )
  }

  return (
    <>
      <div className="settings-card">
        <h2 className="settings-title">App font</h2>
        <Row role="app" label="Interface" />
        <p className="settings-hint">The font for menus, lists and the app chrome.</p>
      </div>
      <div className="settings-card">
        <h2 className="settings-title">Note fonts</h2>
        {NOTE_ROLES.map((r) => (
          <Row key={r.role} role={r.role} label={r.label} />
        ))}
        <p className="settings-hint">Applied when reading notes. Click a row to preview and choose.</p>
      </div>
      <FontPicker
        open={picking !== null}
        role={picking ?? 'body'}
        currentId={picking ? idFor(picking) : 'system'}
        onPick={(id) => picking && pick(picking, id)}
        onClose={() => setPicking(null)}
      />
    </>
  )
}
```

- [ ] **Step 6: Add picker + control CSS**

Append to `src/renderer/src/styles.css`:

```css
/* ── font picker ────────────────────────────────────────────────────────── */
.font-picker {
  width: min(760px, 92vw);
}
.font-picker-body {
  display: grid;
  grid-template-columns: 240px 1fr;
  gap: 16px;
  max-height: 60vh;
}
.font-list {
  overflow-y: auto;
  border-right: 1px solid var(--hairline);
  padding-right: 8px;
}
.font-row {
  display: block;
  width: 100%;
  text-align: left;
  appearance: none;
  background: none;
  border: none;
  border-radius: 8px;
  padding: 8px 10px;
  font-size: 15px;
  color: var(--text-1);
  cursor: pointer;
}
.font-row:hover {
  background: var(--bg-inset);
}
.font-row[aria-pressed='true'] {
  background: var(--bg-inset);
  outline: 1px solid var(--navy);
}
.font-specimen {
  overflow-y: auto;
  padding: 8px 4px;
}
.font-pick-btn {
  min-width: 140px;
  text-align: left;
}
```

- [ ] **Step 7: Run all new tests + typecheck + build**

Run: `npx tsc --noEmit && npx vitest run src/renderer/src/views/settings && npm run build`
Expected: PASS; build clean.

- [ ] **Step 8: Manual smoke (electron)**

Run: `npm run dev`. Open Settings → Typography. Click a note-font row → picker opens, hover fonts → specimen updates → Use this font → the open note re-renders in the chosen face; relaunch → choice persists.

- [ ] **Step 9: Commit**

```bash
git add src/renderer/src/views/settings/FontPicker.tsx src/renderer/src/views/settings/FontPicker.test.tsx src/renderer/src/views/settings/TypographySection.tsx src/renderer/src/styles.css
git commit -m "feat(fonts): typography settings with live-preview picker"
```

---

## Self-Review Notes

**Spec coverage:** Nav grouping → Task 1. Settings tabs/cards → Task 2. Font catalog + bundled offline faces → Task 3. Persistence (IPC + sqlite) → Task 4. Live apply via CSS vars → Task 5. Preview picker popup + Typography tab (app + 4 note roles) → Task 6. Arabic fallback in stacks → Task 3 catalog. All spec sections mapped.

**Type consistency:** `FontSettings` shape identical across Tasks 4/5/6. `FontRole` defined in Task 6 (`FontPicker`), imported by `TypographySection`. `fontById`/`fontsByCategory`/`FontDef` defined Task 3, consumed 5/6. CSS vars `--font-ui`, `--note-title|heading|body|code` written by `applyFonts` (Task 5) and consumed by `.note-body` (Task 5 Step 6) — names match.

**Known coupling (flagged):** `assets/fonts.css` family names are hand-kept in sync with catalog `stack` family names (Task 3). If a font renders as fallback, the mismatch is there. A future generator could remove the hand-sync; out of scope now.
