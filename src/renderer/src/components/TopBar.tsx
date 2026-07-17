/**
 * v3 global top bar (parity slice B — reference/dom/01-today.html): 42 px,
 * hairline bottom; centered ⌘K pill (440×29, inset ground, kbd cap);
 * right cluster = sync heartbeat pill (mono, ok/warn/rust dot + relative
 * time) and the identity avatar (initial). The bar is the drag region on
 * macOS (traffic lights sit over its left inset).
 */
import { useEffect } from 'react'
import { useApp } from '../stores/app'
import { effectiveIdentity, useIdentity } from '../stores/identity'
import { useSearch } from '../stores/search'
import { dotTone, useSync } from '../stores/sync'
import { useSettingsTab } from '../stores/settingsTab'

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
  const loadSync = useSync((s) => s.load)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const setView = useApp((s) => s.setView)

  useEffect(() => {
    if (!health) void loadSync()
  }, [health, loadSync])

  const tone = dotTone(health)
  const last = health ? (health.lastPush ?? health.lastPull ?? null) : null
  const label =
    tone === 'rust' ? 'sync error' : tone === 'amber' ? 'ahead' : 'synced'
  const initial = (identity?.name ?? '?').trim().charAt(0).toUpperCase() || '?'

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
