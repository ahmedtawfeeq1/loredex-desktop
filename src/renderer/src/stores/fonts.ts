/**
 * Font store: per-user app + per-note-format fonts, persisted core-side and
 * applied live by stamping CSS vars on :root — same shape as the theme store.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { DEFAULT_FONT_SETTINGS, type FontSettings } from '../../../shared/font-settings'
import { fontById } from '../../../shared/fonts'
import { invoke } from '../api'

/**
 * A role set to 'system' clears its inline var instead of stamping the
 * generic Sans system stack, so the stylesheet's :root fallback wins (e.g.
 * --note-title/--note-heading -> var(--font-serif), --note-code ->
 * var(--font-mono)). Stamping Sans there would override those fallbacks.
 */
function applyRole(root: CSSStyleDeclaration, cssVar: string, fontId: string): void {
  if (fontId === 'system') {
    root.removeProperty(cssVar)
  } else {
    root.setProperty(cssVar, fontById(fontId).stack)
  }
}

export function applyFonts(s: FontSettings): void {
  const root = document.documentElement.style
  const roles: Array<[string, string]> = [
    ['--font-ui', s.app],
    ['--note-title', s.note.title],
    ['--note-heading', s.note.headings],
    ['--note-body', s.note.body],
    ['--note-code', s.note.code],
  ]
  for (const [cssVar, fontId] of roles) applyRole(root, cssVar, fontId)
}

interface FontState {
  settings: FontSettings
  loaded: boolean
  load(): Promise<void>
  set(next: FontSettings): Promise<void>
}

export const useFonts = create<FontState>((set, get) => ({
  settings: DEFAULT_FONT_SETTINGS,
  loaded: false,

  async load() {
    try {
      const settings = await invoke('settings.fonts.get', undefined)
      set({ settings, loaded: true })
      applyFonts(settings)
    } catch (e) {
      // first-attach port swap drops early invokes — retry once (app.init pattern)
      if (isErrEnvelope(e) && e.code === 'PORT_SWAPPED') return get().load()
      set({ loaded: true }) // no core yet — keep the defaults applied
    }
  },

  async set(next) {
    set({ settings: next })
    applyFonts(next) // live first; persistence is best-effort
    try {
      await invoke('settings.fonts.set', { fonts: next })
    } catch {
      /* stays applied this session; next launch re-reads storage */
    }
  },
}))

/**
 * Startup wiring (called once from main.tsx before first paint): apply the
 * default stacks synchronously (no flash), then load the persisted settings.
 */
export function initFonts(): void {
  applyFonts(useFonts.getState().settings)
  void useFonts.getState().load()
}
