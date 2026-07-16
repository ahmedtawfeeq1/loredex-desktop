/**
 * Theme setting (story 14.1): per-user app state — system follows the OS via
 * prefers-color-scheme; light/dark pin the resolved theme. The renderer stamps
 * the RESOLVED theme on <html data-theme>, so styles.css only needs the dark
 * default plus the [data-theme='light'] override (DESIGN v3 §2, dark-first).
 */

export const THEME_SETTINGS = ['system', 'light', 'dark'] as const
export type ThemeSetting = (typeof THEME_SETTINGS)[number]
export type ResolvedTheme = 'light' | 'dark'

export function isThemeSetting(v: unknown): v is ThemeSetting {
  return typeof v === 'string' && (THEME_SETTINGS as readonly string[]).includes(v)
}

/** What data-theme should say for a setting given the OS preference. */
export function resolveTheme(setting: ThemeSetting, prefersDark: boolean): ResolvedTheme {
  if (setting === 'system') return prefersDark ? 'dark' : 'light'
  return setting
}
