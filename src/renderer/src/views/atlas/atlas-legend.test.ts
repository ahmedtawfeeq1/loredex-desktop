/**
 * Story epic17.2 (D1 amendment 3): the "How to read this map" legend content
 * and its once-per-app auto-open gate.
 */
import { describe, expect, it } from 'vitest'
import { LEGEND_FIRST_ACTION, LEGEND_SECTIONS, shouldAutoOpenLegend } from './atlas-legend'

const sectionByTitle = (title: string) =>
  LEGEND_SECTIONS.find((s) => s.title === title)

describe('atlas legend content', () => {
  it('covers all six node types', () => {
    const terms = sectionByTitle('Node types')?.rows.map((r) => r.term)
    expect(terms).toEqual(
      expect.arrayContaining(['project', 'note', 'handoff', 'contract', 'source', 'commit']),
    )
  })

  it('covers all six edge categories', () => {
    const terms = sectionByTitle('Edge types')?.rows.map((r) => r.term)
    expect(terms).toEqual(
      expect.arrayContaining([
        'route',
        'thread',
        'wikilink',
        'provenance',
        'contract-link',
        'affinity',
      ]),
    )
  })

  it('names the three zoom levels', () => {
    const terms = sectionByTitle('Zoom levels')?.rows.map((r) => r.term)
    expect(terms).toEqual(['Map', 'Project', 'Thread', 'Deep Dive'])
  })

  it('gives the Tours/Path/Blocked one-liners', () => {
    const terms = sectionByTitle('Actions')?.rows.map((r) => r.term)
    expect(terms).toEqual(['Tours', 'Path', 'Blocked'])
  })

  it('ends on one suggested first action — the Tours button', () => {
    expect(LEGEND_FIRST_ACTION).toMatch(/Tours/)
    expect(LEGEND_FIRST_ACTION.length).toBeGreaterThan(0)
  })

  it('every row explains its term', () => {
    for (const section of LEGEND_SECTIONS) {
      for (const row of section.rows) {
        expect(row.meaning.length, `${row.term}`).toBeGreaterThan(0)
      }
    }
  })
})

describe('legend auto-open gate (once per app.db flag)', () => {
  it('auto-opens on the first-ever visit (flag unset)', () => {
    expect(shouldAutoOpenLegend(false)).toBe(true)
  })

  it('stays closed once the flag is set', () => {
    expect(shouldAutoOpenLegend(true)).toBe(false)
  })
})
