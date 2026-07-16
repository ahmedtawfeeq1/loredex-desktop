/**
 * Story 15.3 (AC5) — the palette-coverage net: every registered action appears
 * in the ⌘K palette with its hint, every combo is unique, every view has a
 * nav action, and the contextual providers still list. An action added to the
 * registry without palette coverage fails HERE.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { useApp, type AppView } from '../stores/app'
import { useDex } from '../stores/dex'
import { useEditor } from '../stores/editor'
import { useFind } from '../stores/find'
import { useHandoffs } from '../stores/handoffs'
import { useReader } from '../stores/reader'
import { useRails } from '../stores/rails'
import { usePlanFlag } from '../stores/planFlag'
import { actionItems } from './palette-items'
import { appActions, VIEW_ORDER } from './registry'

// compile-time: VIEW_ORDER covers exactly the AppView union
const ALL_VIEWS: AppView[] = [
  'home',
  'reader',
  'clients', // agent-ops only in nav; always present in VIEW_ORDER
  'search',
  'handoffs',
  'plan', // v3 §6.4 preview flag; always present in VIEW_ORDER
  'contracts',
  'feed',
  'atlas',
  'sync',
  'settings',
]

/** the nav on a research dex (clients hidden, plan flag off) */
const RESEARCH_VIEWS = ALL_VIEWS.filter((v) => v !== 'clients' && v !== 'plan')

beforeEach(() => {
  useApp.setState({ view: 'home', cheatsheetOpen: false })
  useDex.setState({ type: null })
  usePlanFlag.setState({ enabled: false })
})

describe('the action registry (story 15.3)', () => {
  it('covers every research view, in sidebar order, with ⌘1-9', () => {
    expect(VIEW_ORDER.map((v) => v.view)).toEqual(ALL_VIEWS)
    const actions = appActions()
    RESEARCH_VIEWS.forEach((view, i) => {
      const action = actions.find((a) => a.id === `view:${view}`)
      expect(action, `view:${view}`).toBeDefined()
      expect(action?.shortcut).toBe(`⌘${i + 1}`)
      expect(action?.combo).toEqual({ key: String(i + 1), meta: true })
    })
    expect(actions.some((a) => a.id === 'view:clients')).toBe(false)
    expect(actions.some((a) => a.id === 'view:plan')).toBe(false)
  })

  it('the Plan preview flag adds the Plan view to nav + ⌘n numbering', () => {
    usePlanFlag.setState({ enabled: true })
    const actions = appActions()
    expect(actions.some((a) => a.id === 'view:plan')).toBe(true)
    usePlanFlag.setState({ enabled: false })
  })

  it('agent-ops dexes add Clients: first nine keep ⌘1-9, the tenth is unbound', () => {
    useDex.setState({ type: 'agent-ops' })
    usePlanFlag.setState({ enabled: true })
    const actions = appActions()
    ALL_VIEWS.forEach((view, i) => {
      const action = actions.find((a) => a.id === `view:${view}`)
      expect(action, `view:${view}`).toBeDefined()
      if (i < 9) {
        expect(action?.shortcut).toBe(`⌘${i + 1}`)
      } else {
        expect(action?.combo).toBeUndefined() // no ⌘10 — nav/palette reachable
      }
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

  it('D1 rails: ⌘\\ toggles the sidebar, ⌘⇧\\ the file list (story 16.2)', () => {
    useRails.setState({ sidebar: false, list: false })
    const actions = appActions()
    const sidebar = actions.find((a) => a.id === 'action:toggle-sidebar')
    expect(sidebar?.shortcut).toBe('⌘\\')
    expect(sidebar?.combo).toEqual({ key: '\\', meta: true })
    const list = actions.find((a) => a.id === 'action:toggle-list')
    expect(list?.shortcut).toBe('⇧⌘\\')
    // macOS reports the shifted character: ⌘⇧\ arrives as '|'
    expect(list?.combo).toEqual({ key: '|', meta: true, shift: true })
    sidebar?.run()
    list?.run()
    expect(useRails.getState()).toMatchObject({ sidebar: true, list: true })
    // titles are live — the palette row says what the toggle will DO
    expect(appActions().find((a) => a.id === 'action:toggle-sidebar')?.title).toBe(
      'Expand the sidebar',
    )
    useRails.setState({ sidebar: false, list: false })
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
        // sanctioned holes: the palette itself, and pure key-aliases whose
        // visible twin already lists the intent (v3 bare-C compose = ⌘N)
        expect(['action:palette', 'action:new-handoff-c']).toContain(action.id)
        expect(item).toBeUndefined()
        continue
      }
      expect(item, `${action.id} missing from the palette`).toBeDefined()
      expect(item?.title).toBe(action.title)
      if (action.shortcut) expect(item?.hint).toBe(action.shortcut)
    }
  })

  it('the D1 rail toggles are palette rows with their hints (story 16.2)', () => {
    const items = actionItems('')
    expect(items.find((i) => i.key === 'action:toggle-sidebar')?.hint).toBe('⌘\\')
    expect(items.find((i) => i.key === 'action:toggle-list')?.hint).toBe('⇧⌘\\')
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

describe('D1 writing surface: ⌘E edit toggle + ⌘S save (story 16.4)', () => {
  it('⌘E enters edit mode only from the reader with a note open', () => {
    useEditor.getState().reset()
    useReader.setState({ selected: 'n.md', doc: { meta: {}, body: 'text' } as never })
    useApp.setState({ view: 'home' })
    appActions().find((a) => a.id === 'action:edit-note')?.run()
    expect(useEditor.getState().editing).toBe(false) // not the reader — no-op
    useApp.setState({ view: 'reader' })
    appActions().find((a) => a.id === 'action:edit-note')?.run()
    expect(useEditor.getState()).toMatchObject({ editing: true, path: 'n.md', draft: 'text' })
    // the live title flips; a second ⌘E returns to Read
    expect(appActions().find((a) => a.id === 'action:edit-note')?.title).toBe('Read mode')
    appActions().find((a) => a.id === 'action:edit-note')?.run()
    expect(useEditor.getState().editing).toBe(false)
    useReader.setState({ selected: null, doc: null })
    useEditor.getState().reset()
  })

  it('⌘E and ⌘S carry their hints; ⌘S is shift-exact vs ⇧⌘S Sync now', () => {
    const actions = appActions()
    expect(actions.find((a) => a.id === 'action:edit-note')?.shortcut).toBe('⌘E')
    expect(actions.find((a) => a.id === 'action:save-note')?.combo).toEqual({ key: 's', meta: true })
    expect(actions.find((a) => a.id === 'action:sync-now')?.combo).toEqual({
      key: 's',
      meta: true,
      shift: true,
    })
  })

  it('⌘S outside edit mode is a no-op (never a stray write)', () => {
    useEditor.getState().reset()
    expect(() => appActions().find((a) => a.id === 'action:save-note')?.run()).not.toThrow()
    expect(useEditor.getState().busy).toBe(false)
  })
})

describe('D1a3 find bar: ⌘F opens Read-mode find (story 17.3)', () => {
  it('⌘F carries the hint and a unique meta+f combo', () => {
    const find = appActions().find((a) => a.id === 'action:find-in-note')
    expect(find?.shortcut).toBe('⌘F')
    expect(find?.combo).toEqual({ key: 'f', meta: true })
  })

  it('opens only from the reader with a note open, and never in Edit mode', () => {
    useFind.getState().reset()
    useEditor.getState().reset()
    const run = (): void => appActions().find((a) => a.id === 'action:find-in-note')?.run()

    // off the reader → no-op
    useApp.setState({ view: 'home' })
    useReader.setState({ selected: 'n.md', doc: { meta: {}, body: 'text' } as never })
    run()
    expect(useFind.getState().open).toBe(false)

    // reader, Read mode → opens the bar
    useApp.setState({ view: 'reader' })
    run()
    expect(useFind.getState().open).toBe(true)

    // Edit mode on the SAME note → CodeMirror keeps its own ⌘F, bar stays shut
    useFind.getState().close()
    useEditor.getState().enter('n.md', 'text')
    run()
    expect(useFind.getState().open).toBe(false)

    useReader.setState({ selected: null, doc: null })
    useEditor.getState().reset()
    useFind.getState().reset()
    useApp.setState({ view: 'home' })
  })
})
