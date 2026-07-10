/** Story 14.1: theme setting resolution — the attribute-swap contract. */
import { describe, expect, it } from 'vitest'
import { isThemeSetting, resolveTheme, THEME_SETTINGS } from './theme'

describe('resolveTheme', () => {
  it('system follows the OS preference', () => {
    expect(resolveTheme('system', true)).toBe('dark')
    expect(resolveTheme('system', false)).toBe('light')
  })
  it('explicit settings ignore the OS preference', () => {
    expect(resolveTheme('light', true)).toBe('light')
    expect(resolveTheme('dark', false)).toBe('dark')
  })
})

describe('isThemeSetting', () => {
  it('accepts exactly the three settings', () => {
    for (const s of THEME_SETTINGS) expect(isThemeSetting(s)).toBe(true)
  })
  it('rejects everything else', () => {
    expect(isThemeSetting('auto')).toBe(false)
    expect(isThemeSetting('')).toBe(false)
    expect(isThemeSetting(null)).toBe(false)
    expect(isThemeSetting(1)).toBe(false)
  })
})
