/**
 * Atlas export (story 10.7 AC3): serialize the hand-rolled SVG we already
 * render — no chart lib, no export lib. CSS custom properties are resolved to
 * literal colors at serialization time so the file stands alone (renders on
 * white, no `var(--…)` references), with a small mono caption (vault + date).
 * Pure string assembly is unit-tested; the thin DOM collectors are not.
 */

/** Replace every `var(--name[, fallback])` with a resolved literal value. */
export function resolveCssVars(css: string, resolve: (name: string) => string): string {
  const VAR = /var\((--[\w-]+)(?:\s*,\s*([^()]*))?\)/
  let out = css
  // vars can nest in fallbacks — iterate until fixed point (bounded)
  for (let i = 0; i < 10 && VAR.test(out); i++) {
    out = out.replace(new RegExp(VAR.source, 'g'), (_m, name: string, fallback?: string) => {
      const value = resolve(name).trim()
      return value || (fallback ?? '').trim() || 'currentColor'
    })
  }
  return out
}

export interface ExportSvgOptions {
  /** pane size in px — the exported image matches what the user sees */
  width: number
  height: number
  /** the canvas' current viewBox string (level/scope/filter/overlay state) */
  viewBox: string
  /** the canvas' inner markup (defs + edges + nodes), classes intact */
  inner: string
  /** .atlas CSS rules with variables ALREADY resolved */
  css: string
  caption: string
  /** resolved literal colors/fonts */
  bg: string
  ink: string
  monoFont: string
}

const CAPTION_H = 28

/** A self-contained SVG document: styles inlined, background solid, caption. */
export function buildExportSvg(opts: ExportSvgOptions): string {
  const esc = (s: string): string =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${opts.width}" height="${opts.height + CAPTION_H}" viewBox="0 0 ${opts.width} ${opts.height + CAPTION_H}">`,
    `<style>${opts.css}</style>`,
    `<rect width="${opts.width}" height="${opts.height + CAPTION_H}" fill="${opts.bg}"/>`,
    `<svg x="0" y="0" width="${opts.width}" height="${opts.height}" viewBox="${opts.viewBox}">${opts.inner}</svg>`,
    `<text x="12" y="${opts.height + 18}" font-family="${esc(opts.monoFont)}" font-size="11" fill="${opts.ink}">${esc(opts.caption)}</text>`,
    '</svg>',
  ].join('\n')
}

// ── DOM-side collectors (thin, untested by design) ───────────────────────────

/** Every `.atlas`-scoped rule in the app stylesheets, as one CSS string. */
export function collectAtlasCss(doc: Document): string {
  const parts: string[] = []
  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList
    try {
      rules = sheet.cssRules
    } catch {
      continue // cross-origin sheet — none in this app, but never crash
    }
    for (const rule of Array.from(rules)) {
      if (rule instanceof CSSStyleRule && rule.selectorText.includes('.atlas')) {
        parts.push(rule.cssText)
      }
    }
  }
  return parts.join('\n')
}

/** The current canvas serialized with resolved theme colors + caption. */
export function serializeAtlasCanvas(caption: string): string | null {
  const svg = document.querySelector<SVGSVGElement>('svg.atlas-canvas')
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  const rootStyle = getComputedStyle(document.documentElement)
  const resolve = (name: string): string => rootStyle.getPropertyValue(name)
  return buildExportSvg({
    width: Math.max(Math.round(rect.width), 1),
    height: Math.max(Math.round(rect.height), 1),
    viewBox: svg.getAttribute('viewBox') ?? `0 0 ${rect.width} ${rect.height}`,
    inner: svg.innerHTML,
    css: resolveCssVars(collectAtlasCss(document), resolve),
    caption,
    bg: resolve('--bg-app').trim() || '#FFFFFF',
    ink: resolve('--text-2').trim() || '#6E6E73',
    monoFont: resolve('--font-mono').trim() || 'ui-monospace, monospace',
  })
}

/**
 * One-call export of the current viewport (what the user sees: level, scope,
 * filters, overlay). Secondary action by design — no gold spent. Receipt or
 * failure lands as a toast; user cancel is silent.
 */
export async function exportAtlasView(kind: 'svg' | 'png'): Promise<void> {
  const { useApp } = await import('../../stores/app')
  const { useToasts } = await import('../../stores/toasts')
  const { saveExport } = await import('../../api')
  const vaultPath = useApp.getState().identity?.vaultPath ?? ''
  const vaultName = vaultPath.split('/').filter(Boolean).pop() ?? 'vault'
  const day = new Date().toISOString().slice(0, 10)
  const svg = serializeAtlasCanvas(`${vaultName} · ${day}`)
  if (!svg) {
    useToasts.getState().push('Export failed', 'no atlas canvas on screen — open the Atlas first')
    return
  }
  try {
    const saved =
      kind === 'svg'
        ? await saveExport(`atlas-${vaultName}-${day}.svg`, svg)
        : await saveExport(`atlas-${vaultName}-${day}.png`, await svgToPngBytes(svg))
    if (saved) useToasts.getState().push('Exported', saved)
  } catch (e) {
    useToasts.getState().push('Export failed', String(e))
  }
}

/** Rasterize the export SVG to a PNG (2x for crispness). */
export function svgToPngBytes(svgMarkup: string): Promise<ArrayBuffer> {
  return new Promise((resolvePng, reject) => {
    const blob = new Blob([svgMarkup], { type: 'image/svg+xml' })
    const url = URL.createObjectURL(blob)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      const canvas = document.createElement('canvas')
      canvas.width = img.width * 2
      canvas.height = img.height * 2
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('no 2d context'))
      ctx.scale(2, 2)
      ctx.drawImage(img, 0, 0)
      canvas.toBlob((png) => {
        if (!png) return reject(new Error('rasterization produced nothing'))
        void png.arrayBuffer().then(resolvePng, reject)
      }, 'image/png')
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      reject(new Error('the SVG did not rasterize'))
    }
    img.src = url
  })
}
