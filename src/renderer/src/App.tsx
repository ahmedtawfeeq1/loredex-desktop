/**
 * App shell — DESIGN.md three-pane layout: translucent sidebar (nav + vault
 * identity chip), contextual list pane, reader. v0.1 nav: Reader, Handoffs
 * (open-count badge), Settings.
 */
import { useEffect } from 'react'
import { appActions, VIEW_ORDER } from './actions/registry'
import { isTypingTarget, matchShortcut } from './actions/shortcuts'
import { onEvent, onJoinLink, onOpenHandoff, onVaultChanged } from './api'
import { parseJoinLink } from '../../shared/join-link'
import { IdentityBadge } from './components/IdentityBadge'
import { ShortcutCheatsheet } from './components/ShortcutCheatsheet'
import { SuggestToastStack } from './components/SuggestToast'
import { ToastStack } from './components/ToastStack'
import { useApp } from './stores/app'
import { useAtlas } from './stores/atlas'
import { useContracts } from './stores/contracts'
import { useHandoffs } from './stores/handoffs'
import { useReader } from './stores/reader'
import { useRoute } from './stores/route'
import { useSuggests } from './stores/suggests'
import { useWizard } from './stores/wizard'
import { openCount } from '../../shared/handoff-lanes'
import { useFeed } from './stores/feed'
import { useHome } from './stores/home'
import { useSearch } from './stores/search'
import { useSync } from './stores/sync'
import { AtlasView } from './views/atlas/AtlasView'
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
import { Diagnostics } from './views/reader/Diagnostics'
import { NoteView } from './views/reader/NoteView'
import { RouteDropTarget } from './views/reader/RouteDropTarget'
import { VaultTree } from './views/reader/VaultTree'
import { Palette } from './views/search/Palette'
import { SearchView } from './views/search/SearchView'
import { SettingsView } from './views/settings/SettingsView'
import { CreateVaultWizard } from './views/wizard/CreateVaultWizard'
import { FirstRun } from './views/wizard/FirstRun'
import { JoinVaultWizard } from './views/wizard/JoinVaultWizard'

export default function App(): React.JSX.Element {
  const status = useApp((s) => s.status)
  const view = useApp((s) => s.view)
  const setView = useApp((s) => s.setView)
  const init = useApp((s) => s.init)
  const cards = useHandoffs((s) => s.cards)
  const openInbound = openCount(cards ?? [], 'all')

  useEffect(() => {
    void init()
    // menu-driven vault change (main) → refresh identity + reset the stores
    return onVaultChanged(() => {
      useReader.getState().reset()
      useHandoffs.getState().reset()
      useSearch.getState().reset()
      useHome.getState().reset()
      useSync.getState().reset()
      useFeed.getState().reset()
      useAtlas.getState().reset()
      useContracts.getState().reset()
      useSuggests.getState().reset()
      void init()
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
      <aside className="sidebar">
        <div className="sidebar-drag" />
        <nav aria-label="Views">
          {/* the registry's VIEW_ORDER is the nav — order, labels and ⌘1-9
              hints can never drift apart (story 15.3) */}
          {VIEW_ORDER.map(({ view: v, label }, i) => (
            <button
              key={v}
              type="button"
              className="nav-item"
              aria-current={view === v}
              title={`${label} (⌘${i + 1})`}
              aria-keyshortcuts={`Meta+${i + 1}`}
              onClick={() => setView(v)}
            >
              {label}
              {v === 'handoffs' && openInbound > 0 && (
                <span className="nav-badge">{openInbound}</span>
              )}
            </button>
          ))}
        </nav>
        {status === 'ready' && (
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
        <IdentityBadge />
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
            <main className="pane-reader">
              <RouteDropTarget>
                <NoteView />
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
