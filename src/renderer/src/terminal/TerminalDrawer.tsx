/**
 * Bottom terminal drawer (terminal-splits blueprint 2026-07-18): mounted in
 * the app shell across ALL views, full-width under sidebar+content. Stays
 * mounted whenever a layout tree exists; `open: false` only hides it with
 * display:none — closing the drawer never kills ptys (VS Code behavior).
 * Killing happens on close-pane, vault switch, window close, quit.
 */
import { useEffect, useRef, useState } from 'react'
import { openTerminalWindow, popoutMode } from '../api'
import { useAgentPanel } from '../stores/agentPanel'
import { useTerminal } from '../stores/terminal'
import { collectTermIds, firstTermId } from './paneTree'
import { PaneNode } from './PaneNode'
import { fitTerm } from './xtermRegistry'

/** Top-edge height handle — ListResizeHandle rotated 90°: drag resizes,
 *  pointerup persists, double-click resets to the 280px default. */
function HeightHandle(): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ y: 0, height: 0 })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault()
    start.current = { y: e.clientY, height: useTerminal.getState().height }
    setDragging(true)
    useTerminal.getState().setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    const { y, height } = start.current
    useTerminal.getState().dragHeight(height + (y - e.clientY)) // drag up = taller
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    setDragging(false)
    useTerminal.getState().setResizing(false)
    useTerminal.getState().commitHeight()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    // biome-ignore lint/a11y: separators are pointer-only resize affordances
    // (the ListResizeHandle precedent — keyboard resize is out of scope)
    <div
      className={dragging ? 'term-height-handle dragging' : 'term-height-handle'}
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize the terminal (double-click to reset)"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => useTerminal.getState().resetHeight()}
    />
  )
}

/** Right-edge width handle for the LEFT dock — HeightHandle on the x-axis:
 *  drag right = wider, pointerup persists, double-click resets. */
function WidthHandle(): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ x: 0, width: 0 })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault()
    start.current = { x: e.clientX, width: useTerminal.getState().width }
    setDragging(true)
    useTerminal.getState().setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    const { x, width } = start.current
    useTerminal.getState().dragWidth(width + (e.clientX - x)) // drag right = wider
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    setDragging(false)
    useTerminal.getState().setResizing(false)
    useTerminal.getState().commitWidth()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    // biome-ignore lint/a11y: pointer-only resize affordance (ListResizeHandle precedent)
    <div
      className={dragging ? 'term-width-handle dragging' : 'term-width-handle'}
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize the terminal (double-click to reset)"
      title="Drag to resize · double-click to reset"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
      onDoubleClick={() => useTerminal.getState().resetWidth()}
    />
  )
}

/** BL-4: below this drawer width the header actions collapse into a ☰ menu. */
const COLLAPSE_ACTIONS_BELOW = 380

interface TermAction {
  key: string
  label: string
  title: string
  run: () => void
}

/**
 * BL-4: the terminal's header actions, rendered inline when there's room and as
 * a ☰ overflow menu when the drawer is too narrow — so narrowing the left dock
 * never pushes the buttons over the app's logo/chrome.
 */
function TerminalActions({
  left,
  collapsed,
}: {
  left: boolean
  collapsed: boolean
}): React.JSX.Element {
  const [menuOpen, setMenuOpen] = useState(false)
  const closePane = (): void => {
    const { activeId, root: tree } = useTerminal.getState()
    const id = activeId ?? (tree ? firstTermId(tree) : null)
    if (id) void useTerminal.getState().closePane(id)
  }
  const actions: TermAction[] = [
    ...(popoutMode() === null
      ? [
          {
            key: 'dock',
            label: left ? 'dock ▾' : 'dock ◧',
            title: left ? 'Dock to the bottom' : 'Dock to the left',
            run: () => useTerminal.getState().toggleDock(),
          },
          {
            key: 'pop',
            label: 'pop ⇱',
            title: 'Pop the terminal out into its own window',
            run: () => void openTerminalWindow(null),
          },
        ]
      : []),
    {
      key: 'split-right',
      label: 'split ▸',
      title: 'Split the active pane right',
      run: () => void useTerminal.getState().splitActive('row'),
    },
    {
      key: 'split-down',
      label: 'split ▾',
      title: 'Split the active pane down',
      run: () => void useTerminal.getState().splitActive('column'),
    },
    { key: 'close', label: 'close', title: 'Close the active pane', run: closePane },
    {
      key: 'agent',
      label: 'agent ▸',
      title: 'Open agent here (vault root)',
      run: () => void useAgentPanel.getState().openHere(),
    },
  ]

  if (!collapsed) {
    return (
      <>
        {actions.map((a) => (
          <button
            key={a.key}
            type="button"
            className="term-hdr-btn"
            title={a.title}
            aria-label={a.title}
            onClick={a.run}
          >
            {a.label}
          </button>
        ))}
      </>
    )
  }

  return (
    <div className="term-hdr-menu-wrap">
      <button
        type="button"
        className="term-hdr-btn term-hdr-menu-btn"
        title="Terminal actions"
        aria-label="Terminal actions"
        aria-haspopup="menu"
        aria-expanded={menuOpen}
        onClick={() => setMenuOpen(!menuOpen)}
      >
        ☰
      </button>
      {menuOpen && (
        <>
          {/* click-away closes; Esc handled on the menu itself */}
          <button
            type="button"
            className="term-hdr-menu-scrim"
            aria-label="Close menu"
            tabIndex={-1}
            onClick={() => setMenuOpen(false)}
          />
          <div
            className="term-hdr-menu"
            role="menu"
            onKeyDown={(e) => {
              if (e.key === 'Escape') setMenuOpen(false)
            }}
          >
            {actions.map((a) => (
              <button
                key={a.key}
                type="button"
                role="menuitem"
                className="term-hdr-menu-item"
                title={a.title}
                onClick={() => {
                  setMenuOpen(false)
                  a.run()
                }}
              >
                {a.label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function TerminalDrawer(): React.JSX.Element | null {
  const root = useTerminal((s) => s.root)
  const open = useTerminal((s) => s.open)
  const height = useTerminal((s) => s.height)
  const width = useTerminal((s) => s.width)
  const dock = useTerminal((s) => s.dock)
  const resizing = useTerminal((s) => s.resizing)

  useEffect(() => {
    // fit is wrong under display:none — refit every leaf on reveal
    if (!open) return
    const tree = useTerminal.getState().root
    if (tree) {
      requestAnimationFrame(() => {
        for (const id of collectTermIds(tree)) fitTerm(id)
      })
    }
  }, [open])

  if (root === null) return null

  const left = dock === 'left'
  // BL-4: a narrow LEFT dock can't fit the inline action row — it used to run
  // past the drawer and overlap the app chrome. Below this width the actions
  // collapse into a ☰ menu instead. The bottom dock is full-width, never tight.
  const collapsed = left && width < COLLAPSE_ACTIONS_BELOW
  const cls = [
    'terminal-drawer',
    left ? 'dock-left' : 'dock-bottom',
    open ? '' : 'terminal-drawer-hidden',
    resizing ? 'term-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={left ? { width } : { height }}>
      {left ? <WidthHandle /> : <HeightHandle />}
      <div className="terminal-drawer-header">
        <span className="terminal-drawer-title">TERMINAL</span>
        <TerminalActions left={left} collapsed={collapsed} />
      </div>
      <div className="terminal-drawer-body">
        <PaneNode pane={root} path={[]} />
      </div>
    </div>
  )
}
