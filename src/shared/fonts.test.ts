import { describe, expect, it } from 'vitest'
import { FONTS, SYSTEM_FONT, fontById, fontsByCategory } from './fonts'

describe('font catalog', () => {
  it('has system + 14 fonts with unique ids', () => {
    expect(FONTS).toHaveLength(15)
    expect(new Set(FONTS.map((f) => f.id)).size).toBe(15)
  })

  it('every non-system font bundles at least one file and has a stack', () => {
    for (const f of FONTS) {
      expect(f.stack.length).toBeGreaterThan(0)
      if (f.id !== 'system') expect(f.files.length).toBeGreaterThan(0)
    }
  })

  it('system font bundles no files', () => {
    expect(SYSTEM_FONT.id).toBe('system')
    expect(SYSTEM_FONT.files).toHaveLength(0)
  })

  it('every category is represented', () => {
    const cats = new Set(FONTS.map((f) => f.category))
    expect(cats).toEqual(new Set(['Sans', 'Display', 'Mono', 'Arabic']))
  })

  it('fontById falls back to system for unknown ids', () => {
    expect(fontById('nope').id).toBe('system')
    expect(fontById('dm-sans').name).toBe('DM Sans')
  })

  it('fontsByCategory groups all fonts', () => {
    const total = fontsByCategory().reduce((n, g) => n + g.fonts.length, 0)
    expect(total).toBe(FONTS.length)
  })
})
