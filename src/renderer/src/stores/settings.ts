/**
 * Theme store (story 14.1): system / light / dark, persisted core-side and
 * applied live by stamping the RESOLVED theme on <html data-theme>. 'system'
 * keeps a prefers-color-scheme listener attached so OS flips apply instantly.
 */
import { create } from 'zustand'
import { resolveTheme, type ThemeSetting } from '../../../shared/theme'
import { invoke } from '../api'

const media = (): MediaQueryList => window.matchMedia('(prefers-color-scheme: dark)')

function apply(setting: ThemeSetting): void {
  document.documentElement.dataset.theme = resolveTheme(setting, media().matches)
}

interface ThemeState {
  setting: ThemeSetting
  loaded: boolean
  load(): Promise<void>
  set(setting: ThemeSetting): Promise<void>
}

export const useTheme = create<ThemeState>((set, get) => ({
  setting: 'system',
  loaded: false,

  async load() {
    try {
      const setting = await invoke('settings.theme.get', undefined)
      set({ setting, loaded: true })
      apply(setting)
    } catch {
      set({ loaded: true }) // no core yet — keep following the OS
    }
  },

  async set(setting) {
    set({ setting })
    apply(setting) // live first; persistence is best-effort
    try {
      await invoke('settings.theme.set', { theme: setting })
    } catch {
      /* stays applied for this session; next launch re-reads the stored value */
    }
  },
}))

/**
 * Startup wiring (called once from main.tsx before first paint): stamp the
 * OS-resolved theme synchronously (no flash), watch the OS, then load the
 * persisted setting.
 */
export function initTheme(): void {
  apply(useTheme.getState().setting)
  media().addEventListener('change', () => {
    if (useTheme.getState().setting === 'system') apply('system')
  })
  void useTheme.getState().load()
}
