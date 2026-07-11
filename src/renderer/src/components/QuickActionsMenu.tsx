/**
 * Quick actions launcher for the sidebar (below the brand): a compact button
 * that opens a popover of the vault's primary actions — New handoff, Route a
 * note, Curate brief, Open Atlas, Sync now. Moved out of the dashboard (user
 * request) so the actions are always one click away, from any view.
 */
import { useEffect, useRef, useState } from 'react'
import { useApp } from '../stores/app'
import { useHandoffs } from '../stores/handoffs'
import { useHome } from '../stores/home'
import { useReader } from '../stores/reader'
import { useRoute } from '../stores/route'
import { useSync } from '../stores/sync'

interface QuickAction {
  key: string
  icon: string
  label: string
  primary?: boolean
  disabled?: boolean
  title?: string
  run: () => void
}

export function QuickActionsMenu({ collapsed }: { collapsed?: boolean }): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const hasBrief = useHome((s) => s.brief?.path != null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onDoc(e: MouseEvent): void {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    function onEsc(e: KeyboardEvent): void {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDoc)
    document.addEventListener('keydown', onEsc)
    return () => {
      document.removeEventListener('mousedown', onDoc)
      document.removeEventListener('keydown', onEsc)
    }
  }, [open])

  const actions: QuickAction[] = [
    {
      key: 'handoff',
      icon: '⇄',
      label: 'New handoff',
      primary: true,
      run: () => useHandoffs.getState().openCompose(),
    },
    { key: 'route', icon: '⤵', label: 'Route a note', run: () => void useRoute.getState().start() },
    {
      key: 'curate',
      icon: '✦',
      label: 'Curate brief',
      disabled: !hasBrief,
      title: hasBrief ? 'Open the product brief' : 'No curated brief yet',
      run: () => {
        const brief = useHome.getState().brief
        if (!brief?.path) return
        useApp.getState().setView('reader')
        void useReader.getState().open(brief.path)
      },
    },
    { key: 'atlas', icon: '◇', label: 'Open Atlas', run: () => useApp.getState().setView('atlas') },
    { key: 'sync', icon: '↑', label: 'Sync now', run: () => void useSync.getState().syncNow() },
  ]

  function pick(a: QuickAction): void {
    if (a.disabled) return
    setOpen(false)
    a.run()
  }

  return (
    <div className="qa-menu" ref={ref}>
      <button
        type="button"
        className="qa-launch"
        aria-haspopup="menu"
        aria-expanded={open}
        title="Quick actions"
        onClick={() => setOpen((v) => !v)}
      >
        <span className="qa-launch-icon" aria-hidden="true">
          ＋
        </span>
        {!collapsed && <span className="qa-launch-label">Quick actions</span>}
      </button>
      {open && (
        <div className="qa-pop" role="menu">
          {actions.map((a) => (
            <button
              key={a.key}
              type="button"
              role="menuitem"
              className={`qa-item${a.primary ? ' qa-item-primary' : ''}`}
              disabled={a.disabled}
              title={a.title ?? a.label}
              onClick={() => pick(a)}
            >
              <span className="qa-item-icon" aria-hidden="true">
                {a.icon}
              </span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
