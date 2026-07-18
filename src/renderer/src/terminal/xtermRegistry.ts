/**
 * Imperative xterm.js instances for the terminal drawer (terminal-splits
 * blueprint 2026-07-18). Instances live OUTSIDE React state: React renders a
 * host div per leaf pane; this registry owns the Terminal objects, their
 * addons, and a pending-output buffer for chunks that arrive before a pane's
 * first mount. Disposal is explicit (closePane / vault reset) — hiding the
 * drawer or remounting a leaf never destroys a terminal.
 */
import { FitAddon } from '@xterm/addon-fit'
import { SearchAddon } from '@xterm/addon-search'
import { WebLinksAddon } from '@xterm/addon-web-links'
import { Terminal, type ITheme } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { invoke } from '../api'

interface Entry {
  term: Terminal
  fit: FitAddon
  /** loaded for later (find-in-terminal is deferred — no keybinding yet) */
  search: SearchAddon
}

const terms = new Map<string, Entry>()
/** term.data chunks that arrived before attachTerm — replayed on first mount */
const pending = new Map<string, string[]>()
/** Safety cap per pending id: normal buffering only spans create→first mount,
 *  but an id that never attaches (orphaned pty edge) must not grow renderer
 *  memory unbounded. Oldest chunks drop first — a capped replay loses head
 *  scrollback, never the live tail. */
const MAX_PENDING_CHARS = 1_000_000

/** ANSI 16 per app theme — plain hex constants beside the token reads (the
 *  app tokens carry no ANSI ramp). Dark keeps xterm's stock Tango ramp; light
 *  gets a light-paper ramp (VS Code Light+ values) so white/bright output
 *  stays legible on the light --bg-inset. refreshTermThemes() swaps ramps on
 *  a theme flip via the data-theme observer below. */
const ANSI_DARK: ITheme = {
  black: '#2E3436', red: '#CC0000', green: '#4E9A06', yellow: '#C4A000',
  blue: '#3465A4', magenta: '#75507B', cyan: '#06989A', white: '#D3D7CF',
  brightBlack: '#555753', brightRed: '#EF2929', brightGreen: '#8AE234',
  brightYellow: '#FCE94F', brightBlue: '#729FCF', brightMagenta: '#AD7FA8',
  brightCyan: '#34E2E2', brightWhite: '#EEEEEC',
}
const ANSI_LIGHT: ITheme = {
  black: '#000000', red: '#CD3131', green: '#00BC00', yellow: '#949800',
  blue: '#0451A5', magenta: '#BC05BC', cyan: '#0598BC', white: '#555555',
  brightBlack: '#666666', brightRed: '#CD3131', brightGreen: '#14CE14',
  brightYellow: '#B5BA00', brightBlue: '#0451A5', brightMagenta: '#BC05BC',
  brightCyan: '#0598BC', brightWhite: '#A5A5A5',
}

/** App tokens → xterm theme: ground/foreground/cursor/selection follow the
 *  app CSS vars (plain hex in both themes); the ANSI 16 come from the ramp
 *  matching the resolved <html data-theme> stamp. */
function xtermTheme(): ITheme {
  const cs = getComputedStyle(document.documentElement)
  const v = (name: string): string => cs.getPropertyValue(name).trim()
  return {
    background: v('--bg-inset'),
    foreground: v('--text-1'),
    cursor: v('--accent'),
    // plain accent hex: xterm renders opaque selection colors at ~0.3 alpha,
    // landing near the app's accent-tint highlight recipe in both themes
    selectionBackground: v('--accent'),
    ...(document.documentElement.dataset.theme === 'light' ? ANSI_LIGHT : ANSI_DARK),
  }
}

/** Mount (or re-parent) the terminal for `id` into `container`. Creates the
 *  Terminal + fit/search/web-links addons on first attach and replays any
 *  buffered output; on a React remount (a split moved the leaf) the live
 *  xterm element is re-parented — xterm has no re-open, but its DOM survives. */
export function attachTerm(id: string, container: HTMLElement): void {
  const existing = terms.get(id)
  if (existing) {
    if (existing.term.element && existing.term.element.parentElement !== container) {
      container.appendChild(existing.term.element)
    }
    fitTerm(id)
    return
  }
  const term = new Terminal({
    fontFamily: getComputedStyle(document.documentElement).getPropertyValue('--font-mono').trim(),
    fontSize: 12,
    lineHeight: 1.2,
    theme: xtermTheme(),
    allowProposedApi: false,
    scrollback: 5000,
  })
  const fit = new FitAddon()
  const search = new SearchAddon()
  term.loadAddon(fit)
  term.loadAddon(search)
  term.loadAddon(new WebLinksAddon())
  term.open(container)
  term.onData((data) => void invoke('term.input', { id, data }).catch(() => {}))
  terms.set(id, { term, fit, search })
  const queued = pending.get(id)
  if (queued) {
    pending.delete(id)
    for (const chunk of queued) term.write(chunk)
  }
  fitTerm(id)
}

/** Write a term.data chunk — or buffer it until the pane first mounts. */
export function writeTerm(id: string, data: string): void {
  const entry = terms.get(id)
  if (entry) {
    entry.term.write(data)
    return
  }
  const queued = pending.get(id) ?? []
  queued.push(data)
  let total = queued.reduce((n, c) => n + c.length, 0)
  while (queued.length > 1 && total > MAX_PENDING_CHARS) total -= queued.shift()!.length
  pending.set(id, queued)
}

/** Refit to the host and push the new grid to the pty. Skips hidden or
 *  zero-size hosts (fit under display:none proposes garbage dimensions). */
export function fitTerm(id: string): void {
  const entry = terms.get(id)
  if (!entry) return
  const host = entry.term.element?.parentElement
  if (!host || host.clientWidth === 0 || host.clientHeight === 0) return
  entry.fit.fit()
  const { cols, rows } = entry.term
  if (cols > 0 && rows > 0) void invoke('term.resize', { id, cols, rows }).catch(() => {})
}

export function focusTerm(id: string): void {
  terms.get(id)?.term.focus()
}

export function disposeTerm(id: string): void {
  terms.get(id)?.term.dispose()
  terms.delete(id)
  pending.delete(id)
}

export function disposeAllTerms(): void {
  for (const id of [...terms.keys()]) disposeTerm(id)
}

/** Re-read the CSS vars and restyle every live instance (theme flip). */
export function refreshTermThemes(): void {
  if (terms.size === 0) return
  const theme = xtermTheme()
  for (const { term } of terms.values()) term.options.theme = theme
}

// stores/settings.ts stamps the resolved theme on <html data-theme> — one
// observer restyles every instance on a flip (guarded: node tests import this
// module through the store chain without a DOM)
if (typeof window !== 'undefined' && typeof MutationObserver !== 'undefined') {
  new MutationObserver(() => refreshTermThemes()).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })
}
