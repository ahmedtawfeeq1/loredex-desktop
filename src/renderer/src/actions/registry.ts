/**
 * THE global action registry (story 15.3): every global user action declared
 * once — title, run, and (where bound) a shortcut combo + display hint. The
 * ⌘K palette, the App-shell keydown handler, the sidebar nav and the `?`
 * cheatsheet all consume THIS list, so an action added here is automatically
 * palette-listed, shortcut-bound and cheatsheet-documented — and the
 * palette-coverage test fails when that contract breaks.
 *
 * Store-driven (zustand getState), no React — unit-testable under node.
 */
import { useApp, type AppView } from '../stores/app'
import { useHandoffs } from '../stores/handoffs'
import { useRails } from '../stores/rails'
import { useRoute } from '../stores/route'
import { useSearch } from '../stores/search'
import { useSync } from '../stores/sync'

export interface ActionCombo {
  /** KeyboardEvent.key, lowercase for letters ('k', '1', '?') */
  key: string
  /** ⌘ on macOS; the handler also accepts Ctrl (same rule as the old ⌘K) */
  meta?: boolean
  shift?: boolean
}

export interface AppAction {
  id: string
  title: string
  /** display hint, e.g. '⌘1' — rendered in the palette + cheatsheet + nav title */
  shortcut?: string
  combo?: ActionCombo
  /** matches even while a modal/palette overlay is open (⌘K only) */
  always?: boolean
  /** not listed inside the palette (the palette cannot summon itself) */
  paletteHidden?: boolean
  run(): void
}

/** Sidebar order IS the shortcut order: ⌘1…⌘9 (AppView type ties the two). */
export const VIEW_ORDER: ReadonlyArray<{ view: AppView; label: string }> = [
  { view: 'home', label: 'Home' },
  { view: 'reader', label: 'Reader' },
  { view: 'handoffs', label: 'Handoffs' },
  { view: 'atlas', label: 'Atlas' },
  { view: 'contracts', label: 'Contracts' },
  { view: 'search', label: 'Search' },
  { view: 'feed', label: 'Activity' },
  { view: 'sync', label: 'Sync' },
  { view: 'settings', label: 'Settings' },
]

export function appActions(): AppAction[] {
  const actions: AppAction[] = VIEW_ORDER.map(({ view, label }, i) => ({
    id: `view:${view}`,
    title: `Go to ${label}`,
    shortcut: `⌘${i + 1}`,
    combo: { key: String(i + 1), meta: true },
    run: () => useApp.getState().setView(view),
  }))
  actions.push(
    {
      id: 'action:new-handoff',
      title: 'New handoff…',
      shortcut: '⌘N',
      combo: { key: 'n', meta: true },
      run: () => {
        useApp.getState().setView('handoffs')
        useHandoffs.getState().openCompose()
      },
    },
    {
      // ⌘R is Electron's reload in dev — route rides ⇧⌘R
      id: 'action:route-note',
      title: 'Route a note…',
      shortcut: '⇧⌘R',
      combo: { key: 'r', meta: true, shift: true },
      run: () => void useRoute.getState().start(),
    },
    {
      id: 'action:sync-now',
      title: 'Sync now',
      shortcut: '⇧⌘S',
      combo: { key: 's', meta: true, shift: true },
      run: () => void useSync.getState().syncNow(),
    },
    {
      // Addendum D1 collapsible rails (story 16.2): ⌘\ sidebar, ⌘⇧\ list.
      // Titles are live — the palette row says what the toggle will DO.
      id: 'action:toggle-sidebar',
      title: useRails.getState().sidebar ? 'Expand the sidebar' : 'Collapse the sidebar',
      shortcut: '⌘\\',
      combo: { key: '\\', meta: true },
      run: () => useRails.getState().toggleSidebar(),
    },
    {
      // macOS reports the SHIFTED character: ⌘⇧\ arrives as key '|' (same
      // US-layout convention as the bare '?' row below)
      id: 'action:toggle-list',
      title: useRails.getState().list ? 'Expand the file list' : 'Collapse the file list',
      shortcut: '⇧⌘\\',
      combo: { key: '|', meta: true, shift: true },
      run: () => useRails.getState().toggleList(),
    },
    {
      id: 'action:shortcuts',
      title: 'Keyboard shortcuts…',
      shortcut: '?',
      combo: { key: '?' },
      run: () => useApp.getState().setCheatsheetOpen(true),
    },
    {
      id: 'action:palette',
      title: 'Command palette',
      shortcut: '⌘K',
      combo: { key: 'k', meta: true },
      always: true, // toggles closed from inside the overlay too
      paletteHidden: true, // the palette cannot summon itself
      run: () => {
        const s = useSearch.getState()
        s.setPaletteOpen(!s.paletteOpen)
      },
    },
  )
  return actions
}
