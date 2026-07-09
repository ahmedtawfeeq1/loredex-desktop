/**
 * App shell — DESIGN.md three-pane layout: translucent sidebar (nav + vault
 * identity chip), contextual list pane, reader. v0.1 ships the reader view
 * only; other nav arrives with its epic.
 */
import { useEffect } from 'react'
import { onVaultChanged } from './api'
import { IdentityBadge } from './components/IdentityBadge'
import { useApp } from './stores/app'
import { useReader } from './stores/reader'
import { NoteView } from './views/reader/NoteView'

const START_HERE = 'Start Here - Product.md'

function ListPane(): React.JSX.Element {
  const open = useReader((s) => s.open)
  const selected = useReader((s) => s.selected)
  return (
    <div className="pane-list">
      <div className="pane-list-header">
        <span className="pane-list-title">Vault</span>
      </div>
      <button
        type="button"
        className="nav-item"
        style={{ margin: '0 8px' }}
        aria-current={selected === START_HERE}
        onClick={() => void open(START_HERE)}
      >
        Start Here - Product
      </button>
    </div>
  )
}

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
  const init = useApp((s) => s.init)

  useEffect(() => {
    void init()
    // menu-driven vault change (main) → refresh identity + reset the reader
    return onVaultChanged(() => {
      useReader.getState().reset()
      void init()
    })
  }, [init])

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="sidebar-drag" />
        <nav aria-label="Views">
          <button type="button" className="nav-item" aria-current="true">
            Reader
          </button>
        </nav>
        <IdentityBadge />
      </aside>
      {status === 'ready' ? (
        <>
          <ListPane />
          <main className="pane-reader">
            <NoteView />
          </main>
        </>
      ) : status === 'no-vault' ? (
        <EmptyVault />
      ) : (
        <div className="empty-state" />
      )}
    </div>
  )
}
