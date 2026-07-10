/**
 * Story 15.3 (AC5) — the palette-coverage net: every registered action appears
 * in the ⌘K palette with its hint, every combo is unique, every view has a
 * nav action, and the contextual providers still list. An action added to the
 * registry without palette coverage fails HERE.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useApp, type AppView } from '../stores/app'
import { useHandoffs } from '../stores/handoffs'
import { actionItems } from './palette-items'
import { appActions, VIEW_ORDER } from './registry'

// compile-time: VIEW_ORDER covers exactly the AppView union
const ALL_VIEWS: AppView[] = [
  'home',
  'reader',
  'handoffs',
  'atlas',
  'contracts',
  'search',
  'feed',
  'sync',
  'settings',
]

beforeEach(() => {
  useApp.setState({ view: 'home', cheatsheetOpen: false })
})

describe('the action registry (story 15.3)', () => {
  it('covers every view, in sidebar order, with ⌘1-9', () => {
    expect(VIEW_ORDER.map((v) => v.view)).toEqual(ALL_VIEWS)
    const actions = appActions()
    ALL_VIEWS.forEach((view, i) => {
      const action = actions.find((a) => a.id === `view:${view}`)
      expect(action, `view:${view}`).toBeDefined()
      expect(action?.shortcut).toBe(`⌘${i + 1}`)
      expect(action?.combo).toEqual({ key: String(i + 1), meta: true })
    })
  })

  it('ids and combos are unique — no shadowed shortcuts, ever', () => {
    const actions = appActions()
    const ids = actions.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
    const combos = actions
      .filter((a) => a.combo)
      .map((a) => `${a.combo?.meta ? 'meta+' : ''}${a.combo?.shift ? 'shift+' : ''}${a.combo?.key}`)
    expect(new Set(combos).size).toBe(combos.length)
  })

  it('every combo-bound action carries a display hint (palette + cheatsheet)', () => {
    for (const action of appActions()) {
      if (action.combo) expect(action.shortcut, action.id).toBeTruthy()
    }
  })

  it('view actions actually switch the view; ? opens the cheatsheet', () => {
    appActions()
      .find((a) => a.id === 'view:atlas')
      ?.run()
    expect(useApp.getState().view).toBe('atlas')
    appActions()
      .find((a) => a.id === 'action:shortcuts')
      ?.run()
    expect(useApp.getState().cheatsheetOpen).toBe(true)
  })
})

describe('⌘K palette coverage (AC2/AC5)', () => {
  it('every registered action appears in the palette with its hint — except the palette itself', () => {
    const items = actionItems('')
    for (const action of appActions()) {
      const item = items.find((i) => i.key === action.id)
      if (action.paletteHidden) {
        expect(action.id).toBe('action:palette') // the only sanctioned hole
        expect(item).toBeUndefined()
        continue
      }
      expect(item, `${action.id} missing from the palette`).toBeDefined()
      expect(item?.title).toBe(action.title)
      if (action.shortcut) expect(item?.hint).toBe(action.shortcut)
    }
  })

  it('the query filters actions by title', () => {
    const items = actionItems('sync')
    expect(items.some((i) => i.key === 'action:sync-now')).toBe(true)
    expect(items.some((i) => i.key === 'action:new-handoff')).toBe(false)
  })

  it('atlas contextual actions list while the Atlas is open (stories 10.3-10.7)', () => {
    expect(actionItems('').some((i) => i.key.startsWith('action:atlas-'))).toBe(false)
    useApp.setState({ view: 'atlas' })
    const keys = actionItems('').map((i) => i.key)
    for (const expected of [
      'action:atlas-overview',
      'action:atlas-tours',
      'action:atlas-filters',
      'action:atlas-path',
      'action:atlas-blocked',
      'action:atlas-overlay',
      'action:atlas-export-svg',
      'action:atlas-export-png',
    ]) {
      expect(keys, expected).toContain(expected)
    }
  })

  it('palette actions run through the same stores (New handoff opens compose)', () => {
    useHandoffs.getState().reset()
    actionItems('')
      .find((i) => i.key === 'action:new-handoff')
      ?.run()
    expect(useApp.getState().view).toBe('handoffs')
    expect(useHandoffs.getState().composeOpen).toBe(true)
  })
})
