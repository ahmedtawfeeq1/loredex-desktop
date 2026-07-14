/**
 * App shell — DESIGN.md three-pane layout: translucent sidebar (nav + vault
 * identity chip), contextual list pane, reader. v0.1 nav: Reader, Handoffs
 * (open-count badge), Settings.
 */
import { Fragment, useEffect } from 'react'
import { appActions, visibleViews } from './actions/registry'
import { isTypingTarget, matchShortcut } from './actions/shortcuts'
import { onEvent, onJoinLink, onOpenHandoff, onVaultChanged } from './api'
import { parseJoinLink } from '../../shared/join-link'
import { BrandMark } from './components/BrandMark'
import { QuickActionsMenu } from './components/QuickActionsMenu'
import { VaultMenu } from './components/VaultMenu'
import { NavIcon, RailChevron } from './components/NavIcon'
import { ShortcutCheatsheet } from './components/ShortcutCheatsheet'
import { SuggestToastStack } from './components/SuggestToast'
import { ToastStack } from './components/ToastStack'
import { useApp } from './stores/app'
import { useAtlas } from './stores/atlas'
import { useContracts } from './stores/contracts'
import { inboxPending, useDex } from './stores/dex'
import { useFileSearch } from './stores/fileSearch'
import { useFind } from './stores/find'
import { useHandoffs } from './stores/handoffs'
import { useRails } from './stores/rails'
import { useReader } from './stores/reader'
import { useRoute } from './stores/route'
import { useSuggests } from './stores/suggests'
import { useTreeSections } from './stores/treeSections'
import { useWizard } from './stores/wizard'
import { openCount } from '../../shared/handoff-lanes'
import { useFeed } from './stores/feed'
import { useHome } from './stores/home'
import { useSearch } from './stores/search'
import { useSync } from './stores/sync'
import { AtlasView } from './views/atlas/AtlasView'
import { ClientsView } from './views/clients/ClientsView'
import { ContractTimeline } from './views/contracts/ContractTimeline'
import { FeedView } from './views/feed/FeedView'
import { AnnotateModal } from './views/handoffs/AnnotateModal'
import { Board } from './views/handoffs/Board'
import { ComposeHandoffModal } from './views/handoffs/ComposeHandoffModal'
import { DeclineReasonModal } from './views/handoffs/DeclineReasonModal'
import { LinkRequestModal } from './views/handoffs/FulfillsPicker'
import { SnoozeUntilPicker } from './views/handoffs/SnoozeUntilPicker'
import { HomeView } from './views/home/HomeView'
import { RouteConfirmCard } from './views/routes/RouteConfirmCard'
import { SyncPanel } from './views/sync/SyncPanel'
import { DataFileView } from './views/reader/DataFileView'
import { Diagnostics } from './views/reader/Diagnostics'
import { ListResizeHandle } from './views/reader/ListResizeHandle'
import { NoteView } from './views/reader/NoteView'
import { RouteDropTarget } from './views/reader/RouteDropTarget'
import { VaultTree } from './views/reader/VaultTree'
import { Palette } from './views/search/Palette'
import { SearchView } from './views/search/SearchView'
import { SettingsView } from './views/settings/SettingsView'
import { CreateVaultWizard } from './views/wizard/CreateVaultWizard'
import { FirstRun } from './views/wizard/FirstRun'
import { JoinVaultWizard } from './views/wizard/JoinVaultWizard'

/** Reader surface: agent-ops data files (yaml/json/csv) render read-only in
 *  DataFileView; everything else is the markdown NoteView. */
function ReaderSurface(): React.JSX.Element {
  const raw = useReader((s) => s.raw)
  const selected = useReader((s) => s.selected)
  if (raw && selected) {
    return <DataFileView path={selected} raw={raw.raw} fileType={raw.fileType} />
  }
  return <NoteView />
}

export default function App(): React.JSX.Element {
  const status = useApp((s) => s.status)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const init = useApp((s) => s.init)
  const cards = useHandoffs((s) => s.cards)
  const openInbound = openCount(cards ?? [], 'all')
  // agent-ops dexes (clients epic): dex type gates the Clients nav; the badge
  // is the fleet-wide pending-inbox count (fs truth via clients.fleet)
  // subscribing to the type makes visibleViews() recompute when the dex loads
  const dexType = useDex((s) => s.type)
  const clientsPending = inboxPending(useDex((s) => s.fleet))
  const nav = visibleViews()
  void dexType
  // collapsible rails (story 16.2, Addendum D1) — per-vault, loaded with init
  const sidebarCollapsed = useRails((s) => s.sidebar)
  const listCollapsed = useRails((s) => s.list)

  useEffect(() => {
    void init()
    void useDex.getState().load()
    void useRails.getState().load()
    void useTreeSections.getState().load()
    // menu-driven vault change (main) → refresh identity + reset the stores
    return onVaultChanged(() => {
      useDex.getState().reset()
      void useDex.getState().load()
      useReader.getState().reset()
      useFind.getState().reset()
      useFileSearch.getState().reset()
      useHandoffs.getState().reset()
      useSearch.getState().reset()
      useHome.getState().reset()
      useSync.getState().reset()
      useFeed.getState().reset()
      useAtlas.getState().reset()
      useContracts.getState().reset()
      useSuggests.getState().reset()
      useRails.getState().reset()
      useTreeSections.getState().reset()
      void init()
      void useRails.getState().load() // the NEW vault's persisted rail state
      void useTreeSections.getState().load() // …and its collapsed sections (16.3)
    })
  }, [init])

  useEffect(() => {
    // ONE global keydown handler over the action registry (story 15.3):
    // ⌘K palette (works from every view/overlay — story 2.4), ⌘1-9 views,
    // ⌘N/⇧⌘R/⇧⌘S write+sync actions, ? cheatsheet. Overlays keep their own
    // keys (Esc/⌘⏎/↑↓⏎); the matcher guards typing + open overlays.
    function onKey(e: KeyboardEvent): void {
      const action = matchShortcut(e, appActions(), {
        typing: isTypingTarget(e.target),
        overlayOpen: document.querySelector('.modal-backdrop, .palette-backdrop') !== null,
      })
      if (action) {
        e.preventDefault()
        action.run()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(
    // stories 7.2/7.3: a write's new card lands on the board without a refetch,
    // from any view (the modal may have been opened from the reader)
    () =>
      onEvent((e) => {
        if (e.kind === 'handoff.created' && e.card) {
          useHandoffs.getState().applyCreated(e.card)
        }
        // story 13.1: wizard step state streams into the stepped modal
        if (e.kind === 'wizard.progress') {
          useWizard.getState().applyProgress(e)
        }
      }),
    [],
  )

  useEffect(
    // story 13.2: loredex://join deep link opens the join wizard pre-filled
    // (the paste path stays available — prefill only)
    () =>
      onJoinLink((raw) => {
        const link = parseJoinLink(raw)
        if (link) useWizard.getState().openJoin(link)
      }),
    [],
  )

  useEffect(
    // notification click (story 3.7): a handoff path opens the brief in the
    // reader; a batched summary ('') opens the board
    () =>
      onOpenHandoff((relPath) => {
        if (relPath) {
          setView('reader')
          void useReader.getState().open(relPath)
        } else {
          setView('handoffs')
        }
      }),
    [setView],
  )

  return (
    <div className="app">
      <aside className={sidebarCollapsed ? 'sidebar rail-collapsed' : 'sidebar'}>
        <div className="sidebar-drag" />
        {/* Addendum D1 collapsible rails (story 16.2): chevron in the pane
            header + ⌘\ — collapsed = 56px icon rail, badges become dots */}
        <div className="sidebar-head">
          <div className="sidebar-brand" title="Loredex">
            <BrandMark size={22} />
            <span className="sidebar-wordmark">Loredex</span>
          </div>
          <button
            type="button"
            className="rail-toggle"
            title={sidebarCollapsed ? 'Expand the sidebar (⌘\\)' : 'Collapse the sidebar (⌘\\)'}
            aria-label={sidebarCollapsed ? 'Expand the sidebar' : 'Collapse the sidebar'}
            aria-expanded={!sidebarCollapsed}
            aria-keyshortcuts="Meta+\"
            onClick={() => useRails.getState().toggleSidebar()}
          >
            <RailChevron dir={sidebarCollapsed ? 'right' : 'left'} />
          </button>
        </div>
        {/* Quick actions live below the brand (user request) — one click from
            any view, not buried in the dashboard. */}
        <QuickActionsMenu collapsed={sidebarCollapsed} />
        <nav aria-label="Views">
          {/* the registry's view list is the nav — order, labels and ⌘1-9
              hints can never drift apart (story 15.3). Clients appears only
              on agent-ops dexes (visibleViews). */}
          {nav.map(({ view: v, label, group }, i) => {
            const firstOfGroup = i === 0 || nav[i - 1].group !== group
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
                  title={i < 9 ? `${label} (⌘${i + 1})` : label}
                  aria-label={label}
                  {...(i < 9 ? { 'aria-keyshortcuts': `Meta+${i + 1}` } : {})}
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
                  {v === 'clients' &&
                    clientsPending > 0 &&
                    (sidebarCollapsed ? (
                      <span className="nav-dot" title={`${clientsPending} inbox item(s) pending`} />
                    ) : (
                      <span className="nav-badge">{clientsPending}</span>
                    ))}
                </button>
              </Fragment>
            )
          })}
        </nav>
        {status === 'ready' && !sidebarCollapsed && (
          <button
            type="button"
            className="button-quiet sidebar-action"
            title="Pick a markdown file to file into the vault (⇧⌘R)"
            aria-keyshortcuts="Meta+Shift+R"
            onClick={() => void useRoute.getState().start()}
          >
            Route a note…
          </button>
        )}
        <VaultMenu collapsed={sidebarCollapsed} />
      </aside>
      {status === 'ready' ? (
        view === 'home' ? (
          <main className="pane-board">
            <HomeView />
          </main>
        ) : view === 'handoffs' ? (
          <main className="pane-board">
            <Board />
          </main>
        ) : view === 'clients' ? (
          <main className="pane-board">
            <ClientsView />
          </main>
        ) : view === 'atlas' ? (
          <main className="pane-board">
            <AtlasView />
          </main>
        ) : view === 'contracts' ? (
          <main className="pane-board">
            <ContractTimeline />
          </main>
        ) : view === 'search' ? (
          <main className="pane-board">
            <SearchView />
          </main>
        ) : view === 'feed' ? (
          <main className="pane-board">
            <FeedView />
          </main>
        ) : view === 'sync' ? (
          <main className="pane-board">
            <SyncPanel />
          </main>
        ) : view === 'settings' ? (
          <main className="pane-board">
            <SettingsView />
          </main>
        ) : (
          <>
            <VaultTree />
            {/* story epic17.4: the file-list/reader resize divider — only while
                the list pane is expanded (collapsed = reader full-bleed) */}
            {!listCollapsed && <ListResizeHandle />}
            <main className="pane-reader">
              {listCollapsed && (
                <button
                  type="button"
                  className="rail-toggle rail-expander"
                  title="Expand the file list (⇧⌘\)"
                  aria-label="Expand the file list"
                  aria-keyshortcuts="Meta+Shift+\"
                  onClick={() => useRails.getState().toggleList()}
                >
                  <RailChevron dir="right" />
                </button>
              )}
              <RouteDropTarget>
                <ReaderSurface />
                <Diagnostics />
              </RouteDropTarget>
            </main>
          </>
        )
      ) : status === 'no-vault' ? (
        <FirstRun />
      ) : (
        <div className="empty-state" />
      )}
      <Palette />
      <ShortcutCheatsheet />
      <CreateVaultWizard />
      <JoinVaultWizard />
      <ComposeHandoffModal />
      <AnnotateModal />
      <DeclineReasonModal />
      <SnoozeUntilPicker />
      <LinkRequestModal />
      <RouteConfirmCard />
      <ToastStack />
      <SuggestToastStack />
    </div>
  )
}
