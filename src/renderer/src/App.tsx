/**
 * App shell — DESIGN.md three-pane layout: translucent sidebar (nav + vault
 * identity chip), contextual list pane, reader. v0.1 nav: Reader, Handoffs
 * (open-count badge), Settings.
 */
import { useEffect } from 'react'
import { onEvent, onOpenHandoff, onVaultChanged } from './api'
import { IdentityBadge } from './components/IdentityBadge'
import { ToastStack } from './components/ToastStack'
import { useApp } from './stores/app'
import { useHandoffs } from './stores/handoffs'
import { useReader } from './stores/reader'
import { useRoute } from './stores/route'
import { openCount } from '../../shared/handoff-lanes'
import { useFeed } from './stores/feed'
import { useHome } from './stores/home'
import { useSearch } from './stores/search'
import { useSync } from './stores/sync'
import { FeedView } from './views/feed/FeedView'
import { AnnotateModal } from './views/handoffs/AnnotateModal'
import { Board } from './views/handoffs/Board'
import { ComposeHandoffModal } from './views/handoffs/ComposeHandoffModal'
import { DeclineReasonModal } from './views/handoffs/DeclineReasonModal'
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

function EmptyVault(): React.JSX.Element {
  const openVaultPicker = useApp((s) => s.openVaultPicker)
  return (
    <div className="empty-state">
      <p>No vault open.</p>
      <button type="button" className="button-primary" onClick={() => void openVaultPicker()}>
        Open vault
      </button>
    </div>
  )
}

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
      void init()
    })
  }, [init])

  useEffect(() => {
    // global Cmd+K: the palette works from every view (story 2.4)
    function onKey(e: KeyboardEvent): void {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        const s = useSearch.getState()
        s.setPaletteOpen(!s.paletteOpen)
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
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'home'}
            onClick={() => setView('home')}
          >
            Home
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'reader'}
            onClick={() => setView('reader')}
          >
            Reader
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'handoffs'}
            onClick={() => setView('handoffs')}
          >
            Handoffs
            {openInbound > 0 && <span className="nav-badge">{openInbound}</span>}
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'search'}
            title="Search the vault (⌘K)"
            onClick={() => setView('search')}
          >
            Search
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'feed'}
            onClick={() => setView('feed')}
          >
            Activity
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'sync'}
            onClick={() => setView('sync')}
          >
            Sync
          </button>
          <button
            type="button"
            className="nav-item"
            aria-current={view === 'settings'}
            onClick={() => setView('settings')}
          >
            Settings
          </button>
        </nav>
        {status === 'ready' && (
          <button
            type="button"
            className="button-quiet sidebar-action"
            title="Pick a markdown file to file into the vault (story 7.4)"
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
        <EmptyVault />
      ) : (
        <div className="empty-state" />
      )}
      <Palette />
      <ComposeHandoffModal />
      <AnnotateModal />
      <DeclineReasonModal />
      <SnoozeUntilPicker />
      <RouteConfirmCard />
      <ToastStack />
    </div>
  )
}
