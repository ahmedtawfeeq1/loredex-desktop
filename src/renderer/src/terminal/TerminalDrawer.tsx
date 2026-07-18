/**
 * Bottom terminal drawer (terminal-splits blueprint 2026-07-18): mounted in
 * the app shell across ALL views, full-width under sidebar+content. Stays
 * mounted whenever a layout tree exists; `open: false` only hides it with
 * display:none — closing the drawer never kills ptys (VS Code behavior).
 * Killing happens on close-pane, vault switch, window close, quit.
 */
import { useEffect, useRef, useState } from 'react'
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

export function TerminalDrawer(): React.JSX.Element | null {
  const root = useTerminal((s) => s.root)
  const open = useTerminal((s) => s.open)
  const height = useTerminal((s) => s.height)
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

  const cls = [
    'terminal-drawer',
    open ? '' : 'terminal-drawer-hidden',
    resizing ? 'term-resizing' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={cls} style={{ height }}>
      <HeightHandle />
      <div className="terminal-drawer-header">
        <span className="terminal-drawer-title">TERMINAL</span>
        <button
          type="button"
          className="term-hdr-btn"
          title="Split the active pane right"
          onClick={() => void useTerminal.getState().splitActive('row')}
        >
          split ▸
        </button>
        <button
          type="button"
          className="term-hdr-btn"
          title="Split the active pane down"
          onClick={() => void useTerminal.getState().splitActive('column')}
        >
          split ▾
        </button>
        <button
          type="button"
          className="term-hdr-btn"
          title="Close the active pane"
          onClick={() => {
            const { activeId, root: tree } = useTerminal.getState()
            const id = activeId ?? (tree ? firstTermId(tree) : null)
            if (id) void useTerminal.getState().closePane(id)
          }}
        >
          close
        </button>
      </div>
      <div className="terminal-drawer-body">
        <PaneNode pane={root} path={[]} />
      </div>
    </div>
  )
}
