/**
 * List-pane resize divider (story epic17.4, DESIGN.md "D1 amendment 3 —
 * Resizable list pane"): a col-resize handle on the file-list/reader border.
 * Drag → live width (clamped 200–480 by the store); double-click → reset to
 * 300. The width itself is applied to `.pane-list` by VaultTree; this element
 * is only the grab target. Rendered by App between VaultTree and the reader,
 * and only while the list pane is expanded.
 *
 * Scoped `<style>` (not styles.css) — that stylesheet is owned by a
 * concurrently-committing workflow (the VaultTree precedent).
 */
import { useRef, useState } from 'react'
import { useRails } from '../../stores/rails'

const HANDLE_CSS = `
.list-resize-handle {
  flex: none;
  align-self: stretch;
  width: 6px;
  margin: 12px 0 12px;
  padding: 0;
  border: 0;
  border-radius: 3px;
  background: transparent;
  cursor: col-resize;
  transition: background 100ms ease-out;
  touch-action: none;
}
.list-resize-handle:hover,
.list-resize-handle.dragging {
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}
.list-resize-handle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .list-resize-handle { transition: none; }
}
`

export function ListResizeHandle(): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ x: 0, width: 0 })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault()
    startRef.current = { x: e.clientX, width: useRails.getState().listWidth }
    setDragging(true)
    useRails.getState().setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    const { x, width } = startRef.current
    useRails.getState().dragListWidth(width + (e.clientX - x))
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    setDragging(false)
    useRails.getState().setResizing(false)
    useRails.getState().commitListWidth()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <>
      <style>{HANDLE_CSS}</style>
      {/* biome-ignore lint/a11y: separators are not focusable widgets; the
          double-click reset + drag are pointer affordances, keyboard users
          resize is out of scope for D1a3 */}
      <div
        className={dragging ? 'list-resize-handle dragging' : 'list-resize-handle'}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the file list (double-click to reset)"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => useRails.getState().resetListWidth()}
      />
    </>
  )
}
