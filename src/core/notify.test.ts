/**
 * Story 3.7: notification/badge decisions — direction + my-projects filtering,
 * first-snapshot suppression, batch collapse, badge math, dedupe across
 * refreshes. Pure logic + the stateful notifier with fake deps.
 */
import { describe, expect, it } from 'vitest'
import type { CoreEvent, MainControlMessage } from '../shared/ipc-contract'
import type { HandoffCard } from '../shared/types'
import { createHandoffNotifier, decideNotifications, openInbound } from './notify'

let n = 0
function card(over: Partial<HandoffCard>): HandoffCard {
  n += 1
  return {
    id: `h${n}`,
    name: `h${n}`,
    from: 'nimbus-api',
    to: 'nimbus-web',
    objective: 'do the thing',
    date: '2026-07-09',
    ageDays: 1,
    status: 'open',
    path: `/vault/projects/nimbus-web/handoffs/h${n}.md`,
    readingOrder: [],
    kind: 'delivery',
    expired: false,
    ...over,
  }
}

describe('openInbound (badge honesty: open inbound only)', () => {
  it('counts open handoffs addressed to my projects; consumed and outbound never count', () => {
    const cards = [
      card({ to: 'nimbus-web' }),
      card({ to: 'nimbus-web', status: 'consumed' }),
      card({ to: 'nimbus-api', from: 'nimbus-web' }),
    ]
    expect(openInbound(cards, ['nimbus-web']).map((c) => c.to)).toEqual(['nimbus-web'])
    // no registered projects (picker-opened vault) → every project is mine
    expect(openInbound(cards, [])).toHaveLength(2)
  })
})

describe('decideNotifications', () => {
  it('suppresses the first snapshot but still sets the badge', () => {
    const cards = [card({}), card({})]
    const d = decideNotifications(null, cards, [], '/vault')
    expect(d.badge).toBe(2)
    expect(d.newOpen).toEqual([])
    expect(d.notifications).toEqual([])
  })

  it('notifies per card up to the threshold, with vault-relative click paths', () => {
    const seen = new Set<string>()
    const fresh = card({ to: 'nimbus-web', from: 'nimbus-api', objective: 'ship it' })
    const d = decideNotifications(seen, [fresh], ['nimbus-web'], '/vault')
    expect(d.notifications).toEqual([
      {
        title: 'New handoff for nimbus-web',
        body: 'nimbus-api ⟶ nimbus-web — ship it',
        relPath: `projects/nimbus-web/handoffs/${fresh.id}.md`,
      },
    ])
  })

  it('collapses N>3 new handoffs into one summary — never a storm', () => {
    const seen = new Set<string>()
    const cards = [card({}), card({}), card({}), card({})]
    const d = decideNotifications(seen, cards, [], '/vault')
    expect(d.newOpen).toHaveLength(4)
    expect(d.notifications).toHaveLength(1)
    expect(d.notifications[0]).toMatchObject({
      body: '4 new handoffs for nimbus-web',
      relPath: '',
    })
  })

  it('ignores handoffs for other projects', () => {
    const d = decideNotifications(new Set(), [card({ to: 'somebody-else' })], ['nimbus-web'], '/v')
    expect(d.badge).toBe(0)
    expect(d.notifications).toEqual([])
  })
})

describe('createHandoffNotifier (refresh-action wiring)', () => {
  function harness(initial: HandoffCard[]) {
    let cards = initial
    const posted: MainControlMessage[] = []
    const events: CoreEvent[] = []
    const notifier = createHandoffNotifier({
      listAll: () => cards,
      myProjects: () => [],
      vaultPath: () => '/vault',
      post: (m) => posted.push(m),
      emit: (e) => events.push(e),
    })
    return { notifier, posted, events, setCards: (next: HandoffCard[]) => (cards = next) }
  }

  it('badges on first refresh, notifies only on later diffs, dedupes across refreshes', () => {
    const a = card({})
    const { notifier, posted, events, setCards } = harness([a])

    notifier.refresh()
    expect(posted).toEqual([{ t: 'badge', count: 1 }])
    expect(events).toEqual([])

    const b = card({ objective: 'new one' })
    setCards([a, b])
    notifier.refresh()
    expect(posted.filter((m) => m.t === 'notify')).toHaveLength(1)
    expect(events).toEqual([{ kind: 'handoff.new', handoff: b }])
    expect(posted.at(-2)).toEqual({ t: 'badge', count: 2 })
    expect(notifier.log.map((l) => l.id)).toEqual([b.id])

    // same state again → badge only, no re-notification
    notifier.refresh()
    expect(posted.filter((m) => m.t === 'notify')).toHaveLength(1)

    // consume drops the badge immediately
    setCards([{ ...a, status: 'consumed' }, b])
    notifier.refresh()
    expect(posted.at(-1)).toEqual({ t: 'badge', count: 1 })
  })

  it('survives a missing config (vault picker pending): no throw, no messages', () => {
    const posted: MainControlMessage[] = []
    const notifier = createHandoffNotifier({
      listAll: () => {
        throw new Error('NO_CONFIG')
      },
      myProjects: () => [],
      vaultPath: () => '/vault',
      post: (m) => posted.push(m),
      emit: () => {},
    })
    expect(notifier.refresh()).toEqual([])
    expect(posted).toEqual([])
  })
})
