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
import { dispatchZoom } from '../views/atlas/atlas-zoom'
import { useApp, type AppView } from '../stores/app'
import { useEditor } from '../stores/editor'
import { useFind } from '../stores/find'
import { useHandoffs } from '../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../stores/identity'
import { useRails } from '../stores/rails'
import { useReader } from '../stores/reader'
import { useRoute } from '../stores/route'
import { useSearch } from '../stores/search'
import { useSync } from '../stores/sync'
import { useToasts } from '../stores/toasts'

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
      // Addendum D1 edit mode (story 16.4): Read ⇄ Edit for the open note.
      // Only acts from the reader with a note open — a no-op elsewhere.
      id: 'action:edit-note',
      title:
        useEditor.getState().editing && useEditor.getState().path === useReader.getState().selected
          ? 'Read mode'
          : 'Edit note',
      shortcut: '⌘E',
      combo: { key: 'e', meta: true },
      run: () => {
        const editor = useEditor.getState()
        const { selected, doc } = useReader.getState()
        if (editor.editing && editor.path === selected) {
          editor.exit()
          return
        }
        if (useApp.getState().view !== 'reader' || !selected || !doc) return
        editor.enter(selected, doc.body)
      },
    },
    {
      // story 16.4: ⌘S saves the edit-mode draft through the core host —
      // meaningful only while editing (the matcher lets ⌘-chords fire from
      // the textarea; shift-exactness keeps ⇧⌘S Sync now separate).
      id: 'action:save-note',
      title: 'Save note',
      shortcut: '⌘S',
      combo: { key: 's', meta: true },
      run: () => {
        const editor = useEditor.getState()
        if (!editor.editing) return
        const identity = effectiveIdentity(useIdentity.getState())
        if (!identity) {
          useToasts.getState().push('Saving needs an identity', 'Set name and email in Settings')
          return
        }
        void editor.save(identity)
      },
    },
    {
      // D1 amendment 3 (story 17.3): ⌘F opens the Read-mode find bar over the
      // rendered note. Edit mode keeps CodeMirror's own ⌘F (its search panel),
      // so this no-ops while the open note is being edited or off the reader.
      id: 'action:find-in-note',
      title: 'Find in note',
      shortcut: '⌘F',
      combo: { key: 'f', meta: true },
      run: () => {
        const { selected } = useReader.getState()
        const editor = useEditor.getState()
        if (useApp.getState().view !== 'reader' || !selected) return
        if (editor.editing && editor.path === selected) return // Edit → CM's ⌘F
        useFind.getState().openBar()
      },
    },
    {
      // D1 amendment 5 (epic19.1): atlas zoom is keyboard-bound + palette-listed
      // through the registry; run() no-ops off the Atlas, and the mounted canvas
      // applies the command via the zoom bus (views/atlas/atlas-zoom).
      // ids stay OUT of the `action:atlas-*` namespace: those are the
      // Atlas-only contextual palette rows (palette-items) that must never leak
      // off-view. These three are GLOBAL registry actions (so the shell binds
      // ⌘=/⌘−/⌘0 and the palette lists them) whose run() self-guards on view.
      id: 'action:zoom-in',
      title: 'Atlas: zoom in',
      shortcut: '⌘=',
      combo: { key: '=', meta: true },
      run: () => {
        if (useApp.getState().view === 'atlas') dispatchZoom('in')
      },
    },
    {
      id: 'action:zoom-out',
      title: 'Atlas: zoom out',
      shortcut: '⌘−',
      combo: { key: '-', meta: true },
      run: () => {
        if (useApp.getState().view === 'atlas') dispatchZoom('out')
      },
    },
    {
      id: 'action:zoom-fit',
      title: 'Atlas: fit to content',
      shortcut: '⌘0',
      combo: { key: '0', meta: true },
      run: () => {
        if (useApp.getState().view === 'atlas') dispatchZoom('fit')
      },
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
