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
import { useBoardFilter } from '../stores/boardFilter'
import { useDex } from '../stores/dex'
import { useEditor } from '../stores/editor'
import { useFind } from '../stores/find'
import { useHandoffs } from '../stores/handoffs'
import { actionsFor, filterByDisplay, laneCards } from '../../../shared/handoff-lanes'
import { useAgentPanel } from '../stores/agentPanel'
import { effectiveIdentity, useIdentity } from '../stores/identity'
import { useRails } from '../stores/rails'
import { useReader } from '../stores/reader'
import { useRoute } from '../stores/route'
import { useSearch } from '../stores/search'
import { useSync } from '../stores/sync'
import { useTerminal } from '../stores/terminal'
import { useToasts } from '../stores/toasts'
import { firstTermId } from '../terminal/paneTree'

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

export type NavGroup = 'Workspace' | 'Collaborate' | 'Knowledge' | 'System'

/** Sidebar order IS the shortcut order: ⌘1…⌘9 (AppView type ties the two).
 *  `group` is a visual section header only — the ⌘n number is the array index. */
export const VIEW_ORDER: ReadonlyArray<{
  view: AppView
  label: string
  group: NavGroup
  /** reachable via ⌘K/palette + deep links only — absorbed per §5 */
  navHidden?: boolean
}> = [
  // v3 nav (parity slice B): the prototype's exact eight, ⌘1-8 in order
  { view: 'home', label: 'Today', group: 'Workspace' },
  { view: 'handoffs', label: 'Inbox', group: 'Workspace' },
  { view: 'plan', label: 'Plan', group: 'Workspace' },
  { view: 'reader', label: 'Reader', group: 'Workspace' },
  { view: 'atlas', label: 'Atlas', group: 'Workspace' },
  { view: 'agents', label: 'Agents', group: 'Workspace' },
  { view: 'feed', label: 'Activity', group: 'Workspace' },
  // back in the nav by user request 2026-07-18: Search rides ⌘8 under
  // Activity (pre-v3 muscle memory); Settings moves to ⌘9
  { view: 'search', label: 'Search', group: 'Workspace' },
  { view: 'settings', label: 'Settings', group: 'System' },
  // agent-ops only (nav row appears with the dex type)
  { view: 'clients', label: 'Clients', group: 'Workspace' },
  { view: 'staged-edits', label: 'Staged edits', group: 'Workspace' },
  // §5 absorptions: views stay routable, nav rows retired
  { view: 'contracts', label: 'Contracts', group: 'Workspace', navHidden: true },
]

/** Views that exist ONLY on an agent-ops dex. Removing them renumbers ⌘1…⌘9 so a
 *  research dex keeps its muscle memory — and, more importantly, never grows an
 *  agent-ops surface (the research-safety invariant). */
const AGENT_OPS_ONLY: ReadonlySet<AppView> = new Set<AppView>(['clients', 'staged-edits'])

/** Nav/shortcut views for the OPEN dex. */
export function visibleViews(): ReadonlyArray<{ view: AppView; label: string; group: NavGroup }> {
  const agentOps = useDex.getState().type === 'agent-ops'
  // Plan's §6.4 preview flag retired: the work-item schema shipped (loredex ≥2.8)
  return VIEW_ORDER.filter(
    (entry) => !entry.navHidden && (agentOps || !AGENT_OPS_ONLY.has(entry.view)),
  )
}

/** The card A/D/S/E act on: the store's selection, else the view's first
 *  triage row (Today = oldest due-now card; Inbox = first shown row). */
function triageTarget(): ReturnType<typeof laneCards>[number] | undefined {
  const view = useApp.getState().view
  if (view !== 'home' && view !== 'handoffs') return undefined
  const { cards, selectedId, project } = useHandoffs.getState()
  const all = cards ?? []
  const selected = all.find((c) => c.id === selectedId)
  if (selected) return selected
  if (view === 'home') {
    // due-now (open or expired-snooze), oldest first — Today's queue order
    return [...all.filter((c) => c.status === 'open' || c.expired)].sort(
      (a, b) => b.ageDays - a.ageDays,
    )[0]
  }
  const { lane, mode } = useBoardFilter.getState()
  return filterByDisplay(laneCards(all, lane, project), mode)[0]
}

export function appActions(): AppAction[] {
  // ⌘1-8 binds the prototype's eight; agent-ops' Clients rides ⌘9; absorbed
  // views (§5: Search, Contracts) stay palette-complete without numbers
  const actions: AppAction[] = visibleViews().map(({ view, label }, i) => ({
    id: `view:${view}`,
    title: `Go to ${label}`,
    ...(i < 9 ? { shortcut: `⌘${i + 1}`, combo: { key: String(i + 1), meta: true } } : {}),
    run: () => useApp.getState().setView(view),
  }))
  for (const entry of VIEW_ORDER) {
    if (!entry.navHidden) continue
    actions.push({
      id: `view:${entry.view}`,
      title: `Go to ${entry.label}`,
      run: () => useApp.getState().setView(entry.view),
    })
  }
  actions.push(
    {
      // dex switching lives in File ▸ Open Vault…; the palette mirrors it
      // (user request 2026-07-18 — the sidebar caret is gone by choice)
      id: 'action:open-dex',
      title: 'Open another dex… (pick a folder)',
      shortcut: '⌘O',
      run: () => void window.loredex.pickVault(),
    },
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
      // v3 §4: the bare compose key (prototype C) — same intent as ⌘N
      id: 'action:new-handoff-c',
      title: 'New handoff (C)',
      paletteHidden: true,
      shortcut: 'C',
      combo: { key: 'c' },
      run: () => {
        useApp.getState().setView('handoffs')
        useHandoffs.getState().openCompose()
      },
    },
    // v3 one-key triage (story 26.3): A/D/S/E act on the selected card in
    // Today's needs-you queue or the Inbox — no-ops anywhere else. Legality
    // is re-checked here AND lib-enforced on write.
    {
      id: 'triage:accept',
      title: 'Accept selected handoff',
      shortcut: 'A',
      combo: { key: 'a' },
      run: () => {
        const card = triageTarget()
        if (card && actionsFor(card, true).includes('accept'))
          void useHandoffs.getState().setStatus(card, { to: 'accepted' })
      },
    },
    {
      id: 'triage:decline',
      title: 'Decline selected handoff…',
      shortcut: 'D',
      combo: { key: 'd' },
      run: () => {
        const card = triageTarget()
        if (card && actionsFor(card, true).includes('decline'))
          useHandoffs.getState().openDecline(card)
      },
    },
    {
      id: 'triage:snooze',
      title: 'Snooze selected handoff…',
      shortcut: 'S',
      combo: { key: 's' },
      run: () => {
        const card = triageTarget()
        if (card && actionsFor(card, true).includes('snooze'))
          useHandoffs.getState().openSnooze(card)
      },
    },
    {
      id: 'triage:consume',
      title: 'Consume selected handoff',
      shortcut: 'E',
      combo: { key: 'e' },
      run: () => {
        const card = triageTarget()
        if (card && (card.status === 'open' || card.status === 'accepted'))
          void useHandoffs.getState().consume(card)
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
      // terminal-splits blueprint 2026-07-18: `meta` matches ⌘ OR ⌃
      // (shortcuts.ts rule), and on macOS ⌘` is the OS window cycler — so
      // users press ⌃`, exactly VS Code muscle memory. Title is live
      // (toggle-sidebar pattern): the palette row says what it will DO.
      id: 'action:toggle-terminal',
      title: useTerminal.getState().open ? 'Close terminal' : 'Open terminal',
      shortcut: '⌃`',
      combo: { key: '`', meta: true },
      run: () => void useTerminal.getState().toggle(),
    },
    {
      // split/close-pane are palette + drawer-header only (⌘\ is the
      // sidebar's; split combos deferred) — combo-less, so no hint needed
      id: 'action:terminal-split-right',
      title: 'Terminal: Split right',
      run: () => void useTerminal.getState().splitActive('row'),
    },
    {
      id: 'action:terminal-split-down',
      title: 'Terminal: Split down',
      run: () => void useTerminal.getState().splitActive('column'),
    },
    {
      id: 'action:terminal-close-pane',
      title: 'Terminal: Close pane',
      run: () => {
        const { activeId, root } = useTerminal.getState()
        const id = activeId ?? (root ? firstTermId(root) : null)
        if (id) void useTerminal.getState().closePane(id)
      },
    },
    {
      // acp blueprint 2026-07-18: ⌘J free in the registry; VS Code panel
      // muscle memory. Title is live (toggle-sidebar pattern).
      id: 'action:toggle-agent-panel',
      title: useAgentPanel.getState().open ? 'Close agent panel' : 'Open agent panel',
      shortcut: '⌘J',
      combo: { key: 'j', meta: true },
      run: () => useAgentPanel.getState().toggle(),
    },
    {
      // combo-less palette action (split-right precedent): open the panel and
      // start a session at the vault root with the picked agent
      id: 'action:open-agent-here',
      title: 'Open agent here',
      run: () => void useAgentPanel.getState().openHere(),
    },
    {
      // chat-completeness: re-send the last user turn (palette twin of the
      // composer Retry control). Combo-less (open-agent-here precedent) — the
      // store no-ops unless the active session is idle with a turn to resend,
      // so the row is never dead.
      id: 'action:agent-retry',
      title: 'Retry last agent message',
      run: () => void useAgentPanel.getState().retry(),
    },
    {
      // B3 pop-out: open the active conversation in its own standalone window
      // (its own core reads the same vault app.db). ⇧⌘O — 'o' for pop OUT,
      // free in the registry (⌘O is the native menu accelerator, no combo
      // here). No active conversation → the store no-ops (never a dead row).
      id: 'action:pop-out-agent',
      title: 'Pop out agent conversation',
      shortcut: '⇧⌘O',
      combo: { key: 'o', meta: true, shift: true },
      run: () => void useAgentPanel.getState().popOut(),
    },
    {
      // A8 add-to-chat: ⇧⌘L stages the Read-mode note selection into the agent
      // panel (⌘F precedent — guards to the reader; Edit mode is handled by the
      // CM keymap on the same chord, so this no-ops there). 'l' is free in the
      // registry; the read-mode chip is the pointer twin of this shortcut.
      id: 'action:add-selection-to-chat',
      title: 'Add selection to chat',
      shortcut: '⇧⌘L',
      combo: { key: 'l', meta: true, shift: true },
      run: () => {
        const { selected } = useReader.getState()
        const editor = useEditor.getState()
        if (useApp.getState().view !== 'reader' || !selected) return
        if (editor.editing && editor.path === selected) return // Edit → CM keymap
        const text = typeof window !== 'undefined' ? (window.getSelection()?.toString() ?? '') : ''
        if (!text.trim()) return
        useAgentPanel.getState().addContext(text, selected)
      },
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
