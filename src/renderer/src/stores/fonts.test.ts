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

  it('defaults clear every inline var so the stylesheet :root fallback wins', () => {
    applyFonts(DEFAULT_FONT_SETTINGS)
    const root = document.documentElement.style
    expect(root.getPropertyValue('--font-ui')).toBe('')
    expect(root.getPropertyValue('--note-title')).toBe('')
    expect(root.getPropertyValue('--note-heading')).toBe('')
    expect(root.getPropertyValue('--note-body')).toBe('')
    expect(root.getPropertyValue('--note-code')).toBe('')
  })

  it('mixed config clears system roles but stamps non-system roles', () => {
    applyFonts({ app: 'system', note: { title: 'sora', headings: 'system', body: 'system', code: 'system' } })
    const root = document.documentElement.style
    expect(root.getPropertyValue('--font-ui')).toBe('')
    expect(root.getPropertyValue('--note-title')).toBe(fontById('sora').stack)
    expect(root.getPropertyValue('--note-heading')).toBe('')
    expect(root.getPropertyValue('--note-body')).toBe('')
    expect(root.getPropertyValue('--note-code')).toBe('')
  })
})
