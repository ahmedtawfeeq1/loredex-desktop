/**
 * Story epic17.2 (D1 amendment 3, "Header redesign"): the header toolbar
 * structure — three grouped-pill groups, a single Export ▾ button, a `?`, and
 * no naked (label-less / tooltip-less) affordance.
 */
import { describe, expect, it } from 'vitest'
import { EXPORT_FORMATS, TOOLBAR_GROUPS, toolbarLabel } from './atlas-toolbar'

const flat = TOOLBAR_GROUPS.flat()

describe('atlas toolbar model', () => {
  it('groups the actions into exactly three pill groups in reading order', () => {
    expect(TOOLBAR_GROUPS).toHaveLength(3)
    expect(TOOLBAR_GROUPS[0]?.map((a) => a.id)).toEqual(['tours', 'filters', 'path'])
    expect(TOOLBAR_GROUPS[1]?.map((a) => a.id)).toEqual(['blocked', 'changed'])
    expect(TOOLBAR_GROUPS[2]?.map((a) => a.id)).toEqual(['export', 'help'])
  })

  it('exports through ONE button with an SVG/PNG submenu — never two buttons', () => {
    const exports = flat.filter((a) => a.id === 'export')
    expect(exports).toHaveLength(1)
    expect(exports[0]?.submenu).toEqual(['svg', 'png'])
    expect(EXPORT_FORMATS).toEqual(['svg', 'png'])
    // no standalone PNG action leaks in beside it
    expect(flat.some((a) => a.label.toLowerCase() === 'png')).toBe(false)
  })

  it('carries a `?` help action', () => {
    expect(flat.some((a) => a.id === 'help')).toBe(true)
  })

  it('has no naked buttons — every action has a label and a tooltip', () => {
    for (const a of flat) {
      expect(a.label.length, `${a.id} label`).toBeGreaterThan(0)
      expect(a.tooltip.length, `${a.id} tooltip`).toBeGreaterThan(0)
    }
  })

  it('inlines the active-filter count on the Filters pill only', () => {
    const filters = flat.find((a) => a.id === 'filters')!
    const tours = flat.find((a) => a.id === 'tours')!
    expect(toolbarLabel(filters, 0)).toBe('Filters')
    expect(toolbarLabel(filters, 3)).toBe('Filters·3')
    expect(toolbarLabel(tours, 3)).toBe('Tours') // count is a Filters-only affordance
  })
})
