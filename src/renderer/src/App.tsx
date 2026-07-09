/**
 * App shell — DESIGN.md three-pane layout: translucent sidebar (nav + vault
 * identity chip), contextual list pane, reader. v0.1 nav: Reader, Handoffs
 * (open-count badge), Settings.
 */
import { useEffect } from 'react'
import { onVaultChanged } from './api'
import { IdentityBadge } from './components/IdentityBadge'
import { useApp } from './stores/app'
import { useHandoffs } from './stores/handoffs'
import { useReader } from './stores/reader'
import { openCount } from '../../shared/handoff-lanes'
import { Board } from './views/handoffs/Board'
import { Diagnostics } from './views/reader/Diagnostics'
import { NoteView } from './views/reader/NoteView'
import { VaultTree } from './views/reader/VaultTree'

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
      void init()
    })
  }, [init])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-drag" />
        <nav aria-label="Views">
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
        </nav>
        <IdentityBadge />
      </aside>
      {status === 'ready' ? (
        view === 'handoffs' ? (
          <main className="pane-board">
            <Board />
          </main>
        ) : (
          <>
            <VaultTree />
            <main className="pane-reader">
              <NoteView />
              <Diagnostics />
            </main>
          </>
        )
      ) : status === 'no-vault' ? (
        <EmptyVault />
      ) : (
        <div className="empty-state" />
      )}
    </div>
  )
}
