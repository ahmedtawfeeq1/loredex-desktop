/**
 * Recursive pane-tree renderer (terminal-splits blueprint 2026-07-18): leaves
 * are TermPanes; splits are flex rows/columns with a draggable 6px divider
 * that updates the split ratio live (ListResizeHandle pointer-capture
 * protocol — no commit on release, the layout tree is session-only in v1).
 */
import { useRef, useState } from 'react'
import { useTerminal } from '../stores/terminal'
import type { Pane, PanePath } from './paneTree'
import { TermPane } from './TermPane'

function SplitDivider({
  dir,
  path,
  ratio,
}: {
  dir: 'row' | 'column'
  path: PanePath
  ratio: number
}): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const start = useRef({ coord: 0, ratio: 0.5, size: 1 })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault()
    const parent = e.currentTarget.parentElement
    const size = parent ? (dir === 'row' ? parent.clientWidth : parent.clientHeight) : 1
    start.current = { coord: dir === 'row' ? e.clientX : e.clientY, ratio, size: Math.max(1, size) }
    setDragging(true)
    useTerminal.getState().setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    const { coord, ratio: startRatio, size } = start.current
    const delta = (dir === 'row' ? e.clientX : e.clientY) - coord
    useTerminal.getState().updateRatio(path, startRatio + delta / size)
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    setDragging(false)
    useTerminal.getState().setResizing(false)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    // no commit — the layout tree isn't persisted in v1
  }

  const cls = [
    'term-divider',
    dir === 'row' ? 'term-divider-row' : 'term-divider-column',
    dragging ? 'dragging' : '',
  ]
    .filter(Boolean)
    .join(' ')
  return (
    // biome-ignore lint/a11y: separators are pointer-only resize affordances
    // (the ListResizeHandle precedent — keyboard resize is out of scope)
    <div
      className={cls}
      role="separator"
      aria-orientation={dir === 'row' ? 'vertical' : 'horizontal'}
      aria-label="Resize the split"
      title="Drag to resize"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={endDrag}
      onPointerCancel={endDrag}
    />
  )
}

export function PaneNode({ pane, path }: { pane: Pane; path: PanePath }): React.JSX.Element {
  if (pane.kind === 'term') return <TermPane id={pane.id} />
  return (
    <div className="term-split" style={{ flexDirection: pane.dir }}>
      <div className="term-split-cell" style={{ flex: pane.ratio }}>
        <PaneNode pane={pane.a} path={[...path, 'a']} />
      </div>
      <SplitDivider dir={pane.dir} path={path} ratio={pane.ratio} />
      <div className="term-split-cell" style={{ flex: 1 - pane.ratio }}>
        <PaneNode pane={pane.b} path={[...path, 'b']} />
      </div>
    </div>
  )
}
