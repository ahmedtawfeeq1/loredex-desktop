/**
 * D1 amendment 5 — trackpad-native atlas navigation.
 *
 * Pure viewBox math for the on-canvas zoom pills and the trackpad gestures
 * (pinch-to-zoom, two-finger scroll pan), plus a tiny module-level command bus:
 * the mounted AtlasCanvas is the single owner of the live viewBox, so the
 * ⌘=/⌘−/⌘0 registry actions and the ⌘K palette dispatch a COMMAND the canvas
 * applies (a real fit needs the live fitRects/pane the component alone holds).
 * No DOM, no React — fully unit-testable.
 */
import { panViewBox, type ViewBox, zoomViewBox } from './atlas-geometry'

/** per-click zoom factor for the +/− pills (viewBox SHRINKS to zoom IN). */
export const ZOOM_STEP = 1.25

/** trackpad pinch (ctrlKey-wheel) → a gentle per-tick zoom factor about the
 *  cursor; scroll-up (deltaY < 0) zooms in, matching macOS pinch-out. */
export function wheelZoomFactor(deltaY: number): number {
  return deltaY > 0 ? 1.12 : 1 / 1.12
}

/** +/− pills zoom about the viewport centre (no cursor to anchor to), clamped
 *  to the shared zoom band via zoomViewBox. */
export function zoomAtCenter(vb: ViewBox, dir: 'in' | 'out', fitW: number): ViewBox {
  const factor = dir === 'in' ? 1 / ZOOM_STEP : ZOOM_STEP
  return zoomViewBox(vb, factor, vb.x + vb.w / 2, vb.y + vb.h / 2, fitW)
}

/** 1:1 reset — one SVG unit per device pixel (viewBox width = pane width),
 *  centred on the current view and clamped to the zoom band. */
export function resetOneToOne(vb: ViewBox, paneW: number, fitW: number): ViewBox {
  return zoomViewBox(vb, paneW / Math.max(vb.w, 1), vb.x + vb.w / 2, vb.y + vb.h / 2, fitW)
}

/** two-finger scroll → pan; shift maps a vertical wheel onto the horizontal
 *  axis. `pxToSvg` converts device-pixel wheel deltas into viewBox units. */
export function wheelPan(
  vb: ViewBox,
  deltaX: number,
  deltaY: number,
  shift: boolean,
  pxToSvg: number,
): ViewBox {
  let dx = deltaX
  let dy = deltaY
  if (shift && dx === 0) {
    dx = deltaY
    dy = 0
  }
  return panViewBox(vb, dx * pxToSvg, dy * pxToSvg)
}

// ── command bus ──────────────────────────────────────────────────────────────
export type ZoomCommand = 'in' | 'out' | 'fit' | 'reset'
type ZoomHandler = (cmd: ZoomCommand) => void
let handler: ZoomHandler | null = null

/** the mounted AtlasCanvas registers its applier; returns an unbind for cleanup
 *  (only the currently-registered handler is cleared, never a newer one). */
export function setZoomHandler(h: ZoomHandler): () => void {
  handler = h
  return () => {
    if (handler === h) handler = null
  }
}

/** a zoom pill / shortcut / palette row asks the live canvas to run a command;
 *  a no-op when the atlas is not mounted. */
export function dispatchZoom(cmd: ZoomCommand): void {
  handler?.(cmd)
}
