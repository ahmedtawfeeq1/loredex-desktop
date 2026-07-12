/**
 * Font store: per-user app + per-note-format fonts, persisted core-side and
 * applied live by stamping CSS vars on :root — same shape as the theme store.
 */
import { create } from 'zustand'
import { isErrEnvelope } from '../../../shared/ipc-contract'
import { DEFAULT_FONT_SETTINGS, type FontSettings } from '../../../shared/font-settings'
import { fontById } from '../../../shared/fonts'
import { invoke } from '../api'

export function applyFonts(s: FontSettings): void {
  const root = document.documentElement.style
  root.setProperty('--font-ui', fontById(s.app).stack)
  root.setProperty('--note-title', fontById(s.note.title).stack)
  root.setProperty('--note-heading', fontById(s.note.headings).stack)
  root.setProperty('--note-body', fontById(s.note.body).stack)
  root.setProperty('--note-code', fontById(s.note.code).stack)
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
