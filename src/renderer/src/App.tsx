/**
 * App shell — DESIGN.md three-pane layout: translucent sidebar (nav + vault
 * identity chip), contextual list pane, reader. v0.1 nav: Reader, Handoffs
 * (open-count badge), Settings.
 */
import { Fragment, useEffect } from 'react'
import { appActions, visibleViews } from './actions/registry'
import { isTypingTarget, matchShortcut } from './actions/shortcuts'
import { onEvent, onJoinLink, onOpenAgent, onOpenHandoff, onVaultChanged, popoutMode } from './api'
import { parseJoinLink } from '../../shared/join-link'
import { AgentPanel } from './agent/AgentPanel'
import { AgentPermissionModal } from './agent/AgentPermissionModal'
import { SideNav } from './components/SideNav'
import { TopBar } from './components/TopBar'
import { QuickActionsMenu } from './components/QuickActionsMenu'
import { VaultMenu } from './components/VaultMenu'
import { NavIcon, RailChevron } from './components/NavIcon'
import { ShortcutCheatsheet } from './components/ShortcutCheatsheet'
import { SuggestToastStack } from './components/SuggestToast'
import { ToastStack } from './components/ToastStack'
import { useAgentPanel } from './stores/agentPanel'
import { useApp } from './stores/app'
import { useAtlas } from './stores/atlas'
import { useContracts } from './stores/contracts'
import { useDex } from './stores/dex'
import { useFileSearch } from './stores/fileSearch'
import { useFind } from './stores/find'
import { useHandoffs } from './stores/handoffs'
import { useRails } from './stores/rails'
import { useReader } from './stores/reader'
import { useRoute } from './stores/route'
import { useSuggests } from './stores/suggests'
import { useTerminal } from './stores/terminal'
import { useTreeSections } from './stores/treeSections'
import { useWizard } from './stores/wizard'
import { TerminalDrawer } from './terminal/TerminalDrawer'
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
import { InboxView } from './views/handoffs/InboxView'
import { PlanView } from './views/plan/PlanView'
import { AgentsView } from './views/agents/AgentsView'
import { useSettingsTab } from './stores/settingsTab'
import { ComposeHandoffModal } from './views/handoffs/ComposeHandoffModal'
import { DeclineReasonModal } from './views/handoffs/DeclineReasonModal'
import { LinkRequestModal } from './views/handoffs/FulfillsPicker'
import { SnoozeUntilPicker } from './views/handoffs/SnoozeUntilPicker'
import { TodayView } from './views/today/TodayView'
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

/** v3 §5: the dissolved Sync view — deep-links land on Settings › System. */
function SyncRedirect(): React.JSX.Element {
  useEffect(() => {
    useSettingsTab.getState().setTab('System')
  }, [])
  return <SettingsView />
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
  const nav = visibleViews()
  void dexType
  // collapsible rails (story 16.2, Addendum D1) — per-vault, loaded with init
  const sidebarCollapsed = useRails((s) => s.sidebar)
  const listCollapsed = useRails((s) => s.list)

  // pop-out windows (?popout=chat|terminal): this window mounts ONLY that panel,
  // full-window, not the full app shell
  const popout = popoutMode()
  useEffect(() => {
    if (popout === 'chat' && !useAgentPanel.getState().open) void useAgentPanel.getState().toggle()
    // the terminal spawn needs the core host — wait until the window reports
    // ready (mount fires before the core port is brokered). toggle() from
    // root===null opens AND spawns the shell at the vault root.
    if (popout === 'terminal' && status === 'ready' && useTerminal.getState().root === null)
      void useTerminal.getState().toggle()
  }, [popout, status])

  // dex-type boot race: the first load() can beat the core host and fail; once
  // the app reports ready, resolve the type for real (null = still unknown)
  useEffect(() => {
    if (status === 'ready' && useDex.getState().type === null) void useDex.getState().load()
  }, [status])

  useEffect(() => {
    void init()
    void useDex.getState().load()
    void useRails.getState().load()
    void useTerminal.getState().load()
    void useAgentPanel.getState().load()
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
      // terminal drawer: kill this window's ptys + dispose xterms (the old
      // core host may already be down — kill failures are swallowed), then
      // read the NEW vault's drawer prefs
      void useTerminal
        .getState()
        .reset()
        .then(() => useTerminal.getState().load())
      // agent panel: acp.stop this window's sessions (the old core may
      // already be down — failures swallowed), then the NEW vault's prefs
      void useAgentPanel
        .getState()
        .reset()
        .then(() => useAgentPanel.getState().load())
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
    // B3 pop-out: a standalone agent window receives its conversation id
    // post-load (mirrors onJoinLink) and resumes it from the shared vault
    // app.db — a fresh live session seeded from the persisted transcript.
    () =>
      onOpenAgent((conversationId) => {
        if (conversationId) void useAgentPanel.getState().resumeConversation(conversationId)
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

  // Standalone pop-out: just the one panel, filling the window (no app shell).
  // A thin top strip clears the macOS traffic lights and drags the window.
  if (popout) {
    return (
      <div className={`standalone-shell popout-${popout}`}>
        <div className="standalone-dragbar" />
        {popout === 'chat' ? (
          <>
            <AgentPanel />
            <AgentPermissionModal />
          </>
        ) : (
          <TerminalDrawer />
        )}
        <ToastStack />
      </div>
    )
  }

  return (
    <div className="app-shell">
      <TopBar />
      <div className="app-main-grid">
      <div className="app">
      <aside className={sidebarCollapsed ? 'sidebar rail-collapsed' : 'sidebar'}>
        <SideNav collapsed={sidebarCollapsed} />
      </aside>
      {status === 'ready' ? (
        view === 'home' ? (
          <main className="pane-board">
            <TodayView />
          </main>
        ) : view === 'handoffs' ? (
          <main className="pane-board">
            <InboxView />
          </main>
        ) : view === 'plan' ? (
          <main className="pane-board">
            <PlanView />
          </main>
        ) : view === 'agents' ? (
          <main className="pane-board">
            <AgentsView />
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
          // v3 §5: the Sync view dissolved into Settings › System — the old
          // view id stays a working deep link
          <main className="pane-board">
            <SyncRedirect />
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
      <AgentPermissionModal />
      <RouteConfirmCard />
      <ToastStack />
      <SuggestToastStack />
      {/* acp blueprint 2026-07-18: .app is a flex ROW, so the agent panel
          mounted last docks right across every view — the row-axis analog of
          the terminal drawer's column-axis mount below */}
      <AgentPanel />
      </div>
      {/* terminal-splits: the drawer lives in the app-main-grid so a single
          instance sits in the bottom row (full width) OR the left column (full
          height) per its dock — no duplicate xterms; renders nothing until the
          first terminal spawns */}
      <TerminalDrawer />
      </div>
    </div>
  )
}
