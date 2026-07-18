/**
 * Agent-panel resize divider (clone of the reader's ListResizeHandle): a
 * col-resize handle straddling the panel's LEFT border. Drag → live width
 * (clamped 280–480 by the store); double-click → reset to 340. The width
 * itself is applied to `.agent-panel` by AgentPanel via inline style; this
 * element is only the grab target, absolutely pinned to the panel's left edge.
 *
 * Drag is INVERTED vs the list handle: the panel is docked on the RIGHT, so it
 * grows as the cursor moves LEFT (negative Δx ⇒ wider) — hence `width - Δx`.
 *
 * Scoped `<style>` (the ListResizeHandle precedent) for the handle's own rule;
 * `.agent-panel { position: relative }` lives beside it in styles.css so the
 * absolute pin resolves against the panel.
 */
import { useRef, useState } from 'react'
import { useAgentPanel } from '../stores/agentPanel'

const HANDLE_CSS = `
.agent-resize-handle {
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 6px;
  transform: translateX(-50%);
  padding: 0;
  border: 0;
  background: transparent;
  cursor: col-resize;
  transition: background 100ms ease-out;
  touch-action: none;
  z-index: 2;
}
.agent-resize-handle:hover,
.agent-resize-handle.dragging {
  background: color-mix(in srgb, var(--accent) 45%, transparent);
}
.agent-resize-handle:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
@media (prefers-reduced-motion: reduce) {
  .agent-resize-handle { transition: none; }
}
`

export function PanelResizeHandle(): React.JSX.Element {
  const [dragging, setDragging] = useState(false)
  const startRef = useRef({ x: 0, width: 0 })

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>): void {
    e.preventDefault()
    startRef.current = { x: e.clientX, width: useAgentPanel.getState().width }
    setDragging(true)
    useAgentPanel.getState().setResizing(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    const { x, width } = startRef.current
    // inverted: right-docked panel grows as the cursor moves left
    useAgentPanel.getState().dragWidth(width - (e.clientX - x))
  }

  function endDrag(e: React.PointerEvent<HTMLDivElement>): void {
    if (!dragging) return
    setDragging(false)
    useAgentPanel.getState().setResizing(false)
    useAgentPanel.getState().commitWidth()
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
  }

  return (
    <>
      <style>{HANDLE_CSS}</style>
      {/* biome-ignore lint/a11y: separators are not focusable widgets; the
          double-click reset + drag are pointer affordances, keyboard users
          resize is out of scope (the ListResizeHandle precedent) */}
      <div
        className={dragging ? 'agent-resize-handle dragging' : 'agent-resize-handle'}
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize the agent panel (double-click to reset)"
        title="Drag to resize · double-click to reset"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={() => useAgentPanel.getState().resetWidth()}
      />
    </>
  )
}
