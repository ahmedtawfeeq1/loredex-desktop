/**
 * Story 10.3: collapsed-atom visibility (lazy expand, single-child
 * suppression), breadcrumb model, and the bounded history stack.
 */
import { describe, expect, it } from 'vitest'
import type { AtlasGraph, AtlasNode } from '../../../../shared/types'
import { type AtlasHistoryEntry, MAX_HISTORY, pushHistory } from '../../stores/atlas'
import { breadcrumbsFor, visibleAtlas } from './atlas-visibility'

const node = (id: string, type: AtlasNode['type'], x = 0, y = 0): AtlasNode => ({
  id,
  type,
  label: id,
  x,
  y,
})

const graph = (over: Partial<AtlasGraph>): AtlasGraph => ({
  level: 'learn',
  scope: { project: 'alpha' },
  nodes: [],
  edges: [],
  clusters: [],
  cyclic: false,
  ...over,
})

describe('visibleAtlas', () => {
  const learnGraph = graph({
    nodes: [
      node('project:alpha', 'project', 40, 40),
      node('note:alpha/design/a', 'note', 40, 170),
      node('note:alpha/design/b', 'note', 280, 170),
      node('note:alpha/notes/only', 'note', 40, 300),
    ],
    clusters: [
      {
        project: 'alpha',
        topics: [
          { name: 'design', nodeIds: ['note:alpha/design/a', 'note:alpha/design/b'], singleChild: false },
          { name: 'notes', nodeIds: ['note:alpha/notes/only'], singleChild: true },
        ],
      },
    ],
  })

  it('collapses multi-note topics into atoms and dissolves single-child groups', () => {
    const v = visibleAtlas(learnGraph, null)
    expect(v.atoms).toHaveLength(1)
    expect(v.atoms[0]).toMatchObject({ key: 'alpha/design', count: 2, x: 40, y: 170 })
    const ids = v.nodes.map((n) => n.id)
    expect(ids).toContain('note:alpha/notes/only') // dissolved — renders directly
    expect(ids).toContain('project:alpha')
    expect(ids).not.toContain('note:alpha/design/a')
  })

  it('expands exactly the requested topic (one topic at a time)', () => {
    const v = visibleAtlas(learnGraph, 'alpha/design')
    expect(v.atoms).toHaveLength(0)
    expect(v.nodes.map((n) => n.id)).toContain('note:alpha/design/a')
  })

  it('deep dive renders everything — atoms are a Learn behavior', () => {
    const v = visibleAtlas(graph({ ...learnGraph, level: 'deep' }), null)
    expect(v.atoms).toHaveLength(0)
    expect(v.nodes).toHaveLength(4)
  })
})

describe('breadcrumbsFor', () => {
  it('renders vault › project › topic with upward targets only', () => {
    const crumbs = breadcrumbsFor({ level: 'learn', scope: { project: 'alpha', topic: 'design' } })
    expect(crumbs.map((c) => c.label)).toEqual(['vault', 'alpha', 'design'])
    expect(crumbs[0]?.target).toEqual({ level: 'overview' })
    expect(crumbs[1]?.target).toEqual({ level: 'learn', project: 'alpha' })
    expect(crumbs[2]?.target).toBeNull() // current position is not a link
  })

  it('marks the current position non-navigable at every depth', () => {
    expect(breadcrumbsFor({ level: 'overview', scope: {} })[0]?.target).toBeNull()
    const atProject = breadcrumbsFor({ level: 'learn', scope: { project: 'alpha' } })
    expect(atProject[1]?.target).toBeNull()
  })
})

describe('pushHistory (bounded node-history stack)', () => {
  const entry = (n: number): AtlasHistoryEntry => ({
    level: 'overview',
    scope: {},
    selectedId: `n${n}`,
  })

  it('appends and truncates the forward tail on a new branch', () => {
    const base = [entry(0), entry(1), entry(2)]
    const { history, index } = pushHistory([...base], 1, entry(9))
    expect(history.map((h) => h.selectedId)).toEqual(['n0', 'n1', 'n9'])
    expect(index).toBe(2)
  })

  it('is bounded at MAX_HISTORY (50), dropping the oldest entries', () => {
    let history = [entry(0)]
    let index = 0
    for (let i = 1; i <= MAX_HISTORY + 10; i++) {
      const next = pushHistory(history, index, entry(i))
      history = next.history
      index = next.index
    }
    expect(history).toHaveLength(MAX_HISTORY)
    expect(history[0]?.selectedId).toBe(`n${11}`) // oldest dropped
    expect(history[MAX_HISTORY - 1]?.selectedId).toBe(`n${MAX_HISTORY + 10}`)
    expect(index).toBe(MAX_HISTORY - 1)
  })
})
