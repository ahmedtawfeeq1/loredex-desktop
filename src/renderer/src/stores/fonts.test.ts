// @vitest-environment jsdom
import { describe, expect, it, beforeEach } from 'vitest'
import { applyFonts } from './fonts'
import { fontById } from '../../../shared/fonts'
import { DEFAULT_FONT_SETTINGS } from '../../../shared/font-settings'

describe('applyFonts', () => {
  beforeEach(() => {
    document.documentElement.removeAttribute('style')
  })

  it('stamps every role var from the settings', () => {
    applyFonts({ app: 'dm-sans', note: { title: 'unbounded', headings: 'sora', body: 'dm-sans', code: 'space-mono' } })
    const root = document.documentElement.style
    expect(root.getPropertyValue('--font-ui')).toBe(fontById('dm-sans').stack)
    expect(root.getPropertyValue('--note-title')).toBe(fontById('unbounded').stack)
    expect(root.getPropertyValue('--note-heading')).toBe(fontById('sora').stack)
    expect(root.getPropertyValue('--note-body')).toBe(fontById('dm-sans').stack)
    expect(root.getPropertyValue('--note-code')).toBe(fontById('space-mono').stack)
  })

  it('defaults resolve to the system stack', () => {
    applyFonts(DEFAULT_FONT_SETTINGS)
    expect(document.documentElement.style.getPropertyValue('--font-ui')).toBe(fontById('system').stack)
  })
})
