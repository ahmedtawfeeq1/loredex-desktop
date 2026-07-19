/**
 * v3 global top bar (parity slice B — reference/dom/01-today.html): 42 px,
 * hairline bottom; centered ⌘K pill (440×29, inset ground, kbd cap);
 * right cluster = sync heartbeat pill (mono, ok/warn/rust dot + relative
 * time) and the identity avatar (initial). The bar is the drag region on
 * macOS (traffic lights sit over its left inset).
 */
import { useEffect } from 'react'
import { useAgentPanel } from '../stores/agentPanel'
import { useApp } from '../stores/app'
import { effectiveIdentity, useIdentity } from '../stores/identity'
import { useSearch } from '../stores/search'
import { dotTone, useSync } from '../stores/sync'
import { useSettingsTab } from '../stores/settingsTab'
import { useTerminal } from '../stores/terminal'

/** panel-bottom glyph — terminal docked at the bottom */
function TermBottomGlyph(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M1.75 10.25 H14.25" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/** panel-left glyph — terminal docked on the left */
function TermLeftGlyph(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M6 2.75 V13.25" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/** panel-right glyph — the agent side panel */
function AgentPanelGlyph(): React.JSX.Element {
  return (
    <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <rect x="1.75" y="2.75" width="12.5" height="10.5" rx="2" stroke="currentColor" strokeWidth="1.3" />
      <path d="M10 2.75 V13.25" stroke="currentColor" strokeWidth="1.3" />
    </svg>
  )
}

/** WP-E: how long local commits may sit unpushed before the 'N unpushed' pill
 *  appears — past the 30s auto-push debounce, so it only shows when auto-push
 *  isn't clearing them (offline / auth / no remote). */
export const UNPUSHED_STALE_MS = 180_000

function relative(iso: string | null | undefined, nowMs: number): string {
  if (!iso) return ''
  const mins = Math.max(0, Math.round((nowMs - Date.parse(iso)) / 60000))
  if (mins < 1) return 'now'
  if (mins < 60) return `${mins}m`
  const h = Math.round(mins / 60)
  return h < 24 ? `${h}h` : `${Math.round(h / 24)}d`
}

export function TopBar(): React.JSX.Element {
  const health = useSync((s) => s.health)
  const aheadSince = useSync((s) => s.aheadSince)
  const loadSync = useSync((s) => s.load)
  const syncNow = useSync((s) => s.syncNow)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const setView = useApp((s) => s.setView)
  const terminalOpen = useTerminal((s) => s.open)
  const terminalDock = useTerminal((s) => s.dock)
  const agentOpen = useAgentPanel((s) => s.open)

  useEffect(() => {
    if (!health) void loadSync()
  }, [health, loadSync])

  const tone = dotTone(health)
  const last = health ? (health.lastPush ?? health.lastPull ?? null) : null
  const label =
    tone === 'rust' ? 'sync error' : tone === 'amber' ? 'ahead' : 'synced'
  const initial = (identity?.name ?? '?').trim().charAt(0).toUpperCase() || '?'
  // WP-E: surface unpushed local commits once auto-push has had its chance
  const unpushed =
    health && health.ahead > 0 && aheadSince != null && Date.now() - aheadSince > UNPUSHED_STALE_MS
      ? health.ahead
      : 0

  return (
    <div className="topbar">
      <div className="topbar-drag" />
      <div className="topbar-center">
        <button
          type="button"
          className="cmdk-pill"
          title="Run any action (⌘K)"
          aria-keyshortcuts="Meta+K"
          onClick={() => useSearch.getState().setPaletteOpen(true)}
        >
          <span className="cmdk-pill-text">Run any action…</span>
          <span className="cmdk-cap">⌘K</span>
        </button>
      </div>
      <div className="topbar-right">
        <button
          type="button"
          className={`topbar-icon${terminalOpen && terminalDock === 'bottom' ? ' is-on' : ''}`}
          title="Terminal — dock bottom"
          aria-label="Open terminal at the bottom"
          aria-pressed={terminalOpen && terminalDock === 'bottom'}
          onClick={() => void useTerminal.getState().openDock('bottom')}
        >
          <TermBottomGlyph />
        </button>
        <button
          type="button"
          className={`topbar-icon${terminalOpen && terminalDock === 'left' ? ' is-on' : ''}`}
          title="Terminal — dock left"
          aria-label="Open terminal on the left"
          aria-pressed={terminalOpen && terminalDock === 'left'}
          onClick={() => void useTerminal.getState().openDock('left')}
        >
          <TermLeftGlyph />
        </button>
        <button
          type="button"
          className={`topbar-icon${agentOpen ? ' is-on' : ''}`}
          title="Toggle the agent panel"
          aria-label="Toggle agent panel"
          aria-pressed={agentOpen}
          onClick={() => useAgentPanel.getState().toggle()}
        >
          <AgentPanelGlyph />
        </button>
        <span className="topbar-sep" aria-hidden="true" />
        {unpushed > 0 && (
          <button
            type="button"
            className="unpushed-pill"
            title="Local commits not yet pushed — click to sync now"
            onClick={() => void syncNow()}
          >
            ↑ {unpushed} unpushed
          </button>
        )}
        <button
          type="button"
          className="sync-pill"
          title="Sync health (Settings › Sync & git)"
          onClick={() => {
            useSettingsTab.getState().setTab('System')
            setView('settings')
          }}
        >
          <span className={`sync-pill-dot tone-${tone}`} aria-hidden="true" />
          {label} {relative(last, Date.now())}
        </button>
        <button
          type="button"
          className="avatar"
          title={identity ? `${identity.name} — identity settings` : 'Set your identity'}
          onClick={() => {
            useSettingsTab.getState().setTab('Personal')
            setView('settings')
          }}
        >
          {initial}
        </button>
      </div>
    </div>
  )
}
