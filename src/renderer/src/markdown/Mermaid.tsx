/**
 * A ```mermaid fence renders as the DIAGRAM, not as its source. Agents write a
 * lot of mermaid into notes (flowcharts of a pipeline, a state machine); the
 * reader showed the raw fence, so reading one meant pasting it into
 * mermaid.live. The block is the viewer: fit-to-view by default, zoom, pan,
 * fullscreen, and a Code toggle back to the fence (which keeps the shared Copy
 * button, so nothing the plain code block offered is lost).
 *
 * mermaid is loaded with a DYNAMIC import: ~3MB of parsers that a vault of
 * notes without a single diagram must not pay for, and the module touches
 * `document` at import time, so a static import would break the node-side
 * renderToStaticMarkup tests of the pipeline.
 *
 * SANITIZE: the SVG bypasses rehype-sanitize (it is produced AFTER the tree is
 * sanitized, from the fence's text). mermaid's own `securityLevel: 'strict'`
 * runs DOMPurify over the generated SVG and refuses html labels — that is the
 * sanitize step for this path, and it must stay 'strict'.
 *
 * THE BOX IS SIZED HERE, NOT IN CSS. It used to be a `max-height` in styles.css
 * while the fit math used its own budget: the two disagreed, the fitted diagram
 * came out taller than the box CSS allowed, and every diagram had a scrollbar
 * with its last row cut off. One owner — this file — or it drifts again.
 */
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react'

/** useLayoutEffect warns when the pipeline is rendered through
 *  renderToStaticMarkup (the node-side tests) — there is no layout to measure
 *  there, and the effect never runs anyway. */
const useMeasureEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect

/** mermaid bakes its palette INTO the SVG at render time, so a theme flip has
 *  to re-render the diagram — same reason the xterm registry watches the same
 *  attribute rather than reading it once. */
function subscribeTheme(onChange: () => void): () => void {
  const mo = new MutationObserver(onChange)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
  return () => mo.disconnect()
}
const readTheme = (): string => document.documentElement.dataset.theme ?? 'dark'

const MIN = 0.15
const MAX = 6
const clamp = (n: number): number => Math.min(MAX, Math.max(MIN, n))

/** the viewport's padding — MUST match .mermaid-viewport in styles.css, because
 *  the box height is computed here (see the header). Top clears the toolbar. */
const PAD_TOP = 34
const PAD_X = 12
const PAD_BOTTOM = 12
const PAD_Y = PAD_TOP + PAD_BOTTOM

/** how much of the window one inline diagram may take before it stops growing.
 *  A flowchart of a whole pipeline is the point of the note it sits in — a
 *  letterbox showing a corner of it is worse than useless. */
const HEIGHT_BUDGET = 0.66
const MIN_BUDGET = 360

/** mermaid.render needs a DOM id unique per call (it mounts a scratch node) */
let seq = 0

/** the scale at which the WHOLE diagram sits inside the available content box.
 *  Floored to whole percent: a fit of half a pixel more than the box is still a
 *  scrollbar, and a scrollbar on a diagram that claims to fit is the bug this
 *  was written for. Pure, so Mermaid.test.ts can hold it to "never overflows". */
export function fitScale(
  box: { w: number; h: number },
  availW: number,
  availH: number,
): number {
  return clamp(Math.floor(Math.min(availW / box.w, availH / box.h) * 100) / 100)
}

/** the box wraps the drawn diagram exactly, until the drawn diagram outgrows
 *  the budget (zoomed past fit) and the box starts scrolling instead */
export function fittedBoxHeight(naturalH: number, scale: number, budget: number): number {
  return Math.min(budget, Math.ceil(naturalH * scale) + PAD_Y)
}

/** the height one inline diagram may claim */
export function heightBudget(windowH: number, full: boolean): number {
  return full ? windowH : Math.max(MIN_BUDGET, windowH * HEIGHT_BUDGET)
}

/** Ink for a label sitting on `fill`. A note's diagram carries author colors
 *  (`style S7 fill:#f8d7da`) chosen on mermaid.live's LIGHT canvas — under the
 *  dark theme mermaid keeps its own light label color and paints white text on
 *  a pastel box, which is unreadable. The fill decides the ink, not the theme.
 *  Returns null when the fill is not a literal color (inherited/none/url) —
 *  those are mermaid's own themed nodes, which are already consistent. */
export function labelInk(fill: string | null | undefined): string | null {
  const c = (fill ?? '').trim()
  let rgb: [number, number, number] | null = null
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(c)
  if (hex) {
    const h = hex[1]
    const wide = h.length === 6
    const at = (i: number): number =>
      wide ? parseInt(h.slice(i * 2, i * 2 + 2), 16) : parseInt(h[i] + h[i], 16)
    rgb = [at(0), at(1), at(2)]
  } else {
    const m = /^rgba?\(([^)]+)\)$/i.exec(c)
    if (m) {
      const parts = m[1].split(',').map((p) => parseFloat(p))
      if (parts.length >= 3 && parts.every((p) => !Number.isNaN(p))) {
        rgb = [parts[0], parts[1], parts[2]]
      }
    }
  }
  if (!rgb) return null
  // perceived brightness (ITU-R BT.601) — the same weighting the diff/chip
  // colors were picked against; 0.6 puts pastels firmly on the dark-ink side
  const lum = (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) / 255
  return lum >= 0.6 ? '#101828' : '#f2f4f8'
}

/** apply labelInk to every node/cluster the diagram's AUTHOR colored. Only
 *  inline fills are read: mermaid's own theme fills arrive via CSS classes, and
 *  those it already pairs with a readable label color. */
function fixLabelContrast(host: HTMLElement): void {
  host.querySelectorAll<SVGGElement>('g.node, g.cluster, g.classGroup').forEach((node) => {
    const shape = node.querySelector<SVGGraphicsElement>('rect, polygon, circle, ellipse, path')
    const ink = labelInk(shape?.style.fill || shape?.getAttribute('fill'))
    if (!ink) return
    // labels are foreignObject html in flowcharts and <text> elsewhere, and the
    // color lives on a mermaid CSS class — only an inline style outranks it
    node.querySelectorAll<SVGElement | HTMLElement>('text, tspan, span, p, div').forEach((el) => {
      el.style.setProperty('color', ink, 'important')
      el.style.setProperty('fill', ink, 'important')
    })
  })
}

/** mermaid sizes the <svg> to its own layout, which for a wide graph is a few
 *  hundred px — dropped into a 1400px reader that reads as "tiny diagram in a
 *  big empty box". The intrinsic size is only the ASPECT; the viewer decides
 *  the pixels. Read it from the viewBox (always emitted, and immune to the
 *  max-width mermaid puts in the inline style). */
function naturalSize(host: HTMLElement): { w: number; h: number } | null {
  const svg = host.querySelector('svg')
  const box = svg?.viewBox?.baseVal
  if (!svg || !box || !box.width || !box.height) return null
  return { w: box.width, h: box.height }
}

export function MermaidBlock({
  code,
  source,
}: {
  code: string
  /** the ordinary code-block rendering, shown by the Code toggle */
  source: ReactNode
}): React.JSX.Element {
  const theme = useSyncExternalStore(subscribeTheme, readTheme, () => 'dark')
  const [svg, setSvg] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [showSource, setShowSource] = useState(false)
  const [scale, setScale] = useState(1)
  const [size, setSize] = useState<{ w: number; h: number } | null>(null)
  const [full, setFull] = useState(false)
  const figureRef = useRef<HTMLElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const canvasRef = useRef<HTMLDivElement | null>(null)
  // a manual zoom OWNS the scale from then on: re-fitting under the user on a
  // window resize (or when the rails collapse) would undo their zoom
  const pinned = useRef(false)

  useEffect(() => {
    let stale = false
    void (async () => {
      try {
        const mermaid = (await import('mermaid')).default
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: 'strict',
          theme: theme === 'light' ? 'default' : 'dark',
          fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-ui'),
        })
        const out = await mermaid.render(`mmd-${(seq += 1)}`, code)
        if (stale) return
        setSvg(out.svg)
        setError(null)
      } catch (e) {
        // a malformed fence is the author's typo, not a crash: show the parse
        // error where the diagram would be, Code toggle still reaches the text
        if (!stale) setError(e instanceof Error ? e.message : String(e))
      }
    })()
    return () => {
      stale = true
    }
  }, [code, theme])

  /** fit the WHOLE diagram into the box — the opening view is the view you can
   *  read (mermaid.live's fit button, but as the default, since a diagram in a
   *  note is meant to be looked at, not hunted for). Width AND height, so a
   *  tall sequence diagram does not blow past the fold; zoom takes it from
   *  there. */
  const fit = useCallback(
    (natural?: { w: number; h: number } | null): void => {
      const box = natural ?? size
      const vp = viewportRef.current
      if (!box || !vp) return
      const budget = heightBudget(window.innerHeight, full)
      setScale(
        fitScale(box, Math.max(80, vp.clientWidth - PAD_X * 2), Math.max(80, budget - PAD_Y)),
      )
    },
    [size, full],
  )

  // measure + fit as soon as the SVG is in the DOM, BEFORE paint — a frame of
  // wrong-size diagram followed by a jump is what this effect exists to avoid
  useMeasureEffect(() => {
    const host = canvasRef.current
    if (!svg || !host) return
    fixLabelContrast(host)
    const natural = naturalSize(host)
    if (!natural) return
    setSize(natural)
    pinned.current = false
    fit(natural)
    // fit() is re-created per `size`; this run passes the fresh measurement in
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svg])

  // the reader column changes width a lot (rails collapse, window resize,
  // fullscreen enter/exit) — re-fit unless the user has taken the zoom over
  useEffect(() => {
    const vp = viewportRef.current
    if (!vp || !size) return
    const refit = (): void => {
      if (!pinned.current) fit()
    }
    const ro = new ResizeObserver(refit)
    ro.observe(vp)
    window.addEventListener('resize', refit)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', refit)
    }
  }, [fit, size])

  const zoom = useCallback((next: (s: number) => number): void => {
    pinned.current = true
    setScale((s) => clamp(next(s)))
  }, [])

  // trackpad pinch arrives as ctrl+wheel; passive:false because we preventDefault
  // (otherwise the pinch zooms the whole window instead of the diagram)
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const onWheel = (e: WheelEvent): void => {
      if (!e.ctrlKey && !e.metaKey) return
      e.preventDefault()
      zoom((s) => s * (1 - e.deltaY / 300))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [svg, zoom])

  // native Fullscreen API on the <figure>: Escape and the OS animation come
  // free, the toolbar rides along because it is a child, and nothing has to be
  // re-rendered into a second mount the way a dialog/portal would need.
  // Entering re-fits against the whole screen (the `full` dep of fit()).
  useEffect(() => {
    const onChange = (): void => {
      setFull(document.fullscreenElement === figureRef.current)
      pinned.current = false
    }
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])
  useEffect(() => {
    if (size) fit()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [full])

  const toggleFullscreen = useCallback(() => {
    const el = figureRef.current
    if (!el) return
    if (document.fullscreenElement === el) void document.exitFullscreen()
    else void el.requestFullscreen?.()
  }, [])

  // the box is exactly the fitted diagram plus its padding, capped by the
  // budget (a zoomed-in diagram stops growing and starts scrolling instead)
  const drawnH = size ? Math.ceil(size.h * scale) : 0
  const budget = full
    ? typeof window === 'undefined'
      ? 0
      : window.innerHeight
    : typeof window === 'undefined'
      ? 0
      : Math.max(MIN_BUDGET, window.innerHeight * HEIGHT_BUDGET)
  const boxStyle = size
    ? { height: full ? '100vh' : `${Math.min(budget, drawnH + PAD_Y)}px` }
    : undefined

  return (
    <figure className="mermaid-block" ref={figureRef}>
      <div className="mermaid-tools">
        <button
          type="button"
          className="mermaid-tool"
          aria-label="Zoom out"
          title="Zoom out"
          onClick={() => zoom((s) => s / 1.25)}
        >
          −
        </button>
        <button
          type="button"
          className="mermaid-tool mermaid-zoom"
          title="Fit to view"
          onClick={() => {
            pinned.current = false
            fit()
          }}
        >
          {Math.round(scale * 100)}%
        </button>
        <button
          type="button"
          className="mermaid-tool"
          aria-label="Zoom in"
          title="Zoom in"
          onClick={() => zoom((s) => s * 1.25)}
        >
          +
        </button>
        <button type="button" className="mermaid-tool" onClick={toggleFullscreen}>
          {full ? 'Close' : 'Expand'}
        </button>
        <button type="button" className="mermaid-tool" onClick={() => setShowSource((v) => !v)}>
          {showSource ? 'Diagram' : 'Code'}
        </button>
      </div>
      {showSource ? (
        source
      ) : error ? (
        <pre className="mermaid-error">{error}</pre>
      ) : svg ? (
        <div className="mermaid-viewport" ref={viewportRef} style={boxStyle}>
          {/* the sizer carries the SCALED footprint — a transform does not
              affect layout, so without it the scroll area (the pan range) stays
              the unscaled size and a zoomed-in diagram cannot be scrolled to */}
          <div
            className="mermaid-sizer"
            style={size ? { width: size.w * scale, height: size.h * scale } : undefined}
          >
            <div
              className="mermaid-canvas"
              ref={canvasRef}
              style={
                size ? { width: size.w, height: size.h, transform: `scale(${scale})` } : undefined
              }
              // mermaid-produced, DOMPurify'd by securityLevel: 'strict' (header)
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </div>
        </div>
      ) : (
        <div className="mermaid-pending">Rendering diagram…</div>
      )}
    </figure>
  )
}
