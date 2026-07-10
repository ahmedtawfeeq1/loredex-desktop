/**
 * Appearance section (story 14.1): system / light / dark segmented control —
 * the DESIGN v2 toggle-row pattern (label left, control right). Applies live,
 * persists per-user (never the vault).
 */
import { useEffect } from 'react'
import { THEME_SETTINGS, type ThemeSetting } from '../../../../shared/theme'
import { useTheme } from '../../stores/settings'

const LABELS: Record<ThemeSetting, string> = { system: 'System', light: 'Light', dark: 'Dark' }

export function ThemeSection(): React.JSX.Element {
  const setting = useTheme((s) => s.setting)
  const loaded = useTheme((s) => s.loaded)
  const load = useTheme((s) => s.load)
  const set = useTheme((s) => s.set)

  useEffect(() => {
    if (!loaded) void load()
  }, [loaded, load])

  return (
    <div className="settings-section">
      <h2 className="settings-title">Appearance</h2>
      <div className="toggle-row">
        <span>Theme</span>
        <div className="seg-control" role="group" aria-label="Theme">
          {THEME_SETTINGS.map((value) => (
            <button
              key={value}
              type="button"
              className="seg-option"
              aria-pressed={setting === value}
              onClick={() => void set(value)}
            >
              {LABELS[value]}
            </button>
          ))}
        </div>
      </div>
      <p className="settings-hint">System follows your Mac's appearance.</p>
    </div>
  )
}
