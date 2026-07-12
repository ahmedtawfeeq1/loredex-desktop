import { describe, expect, it } from 'vitest'
import { DEFAULT_FONT_SETTINGS, isFontSettings } from './font-settings'

describe('isFontSettings', () => {
  it('accepts the default', () => expect(isFontSettings(DEFAULT_FONT_SETTINGS)).toBe(true))
  it('rejects partials', () => expect(isFontSettings({ app: 'dm-sans' })).toBe(false))
  it('rejects non-objects', () => expect(isFontSettings(null)).toBe(false))
})
