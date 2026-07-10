/**
 * Story 7.2 store tests: optimistic insert from handoff.created (no full
 * refetch) + the receipt-toast primitives every M2 write flows through.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HandoffCard, RoutePreview } from '../../../shared/types'
import { useHandoffs } from './handoffs'
import { needsProject } from './route'
import { receiptDetail, useToasts } from './toasts'

const card = (id: string): HandoffCard => ({
  id,
  name: id,
  from: 'web',
  to: 'api',
  objective: `do ${id}`,
  date: '2026-07-10',
  ageDays: 0,
  status: 'open',
  path: `/v/projects/api/handoffs/${id}.md`,
  readingOrder: [],
  kind: 'delivery',
  expired: false,
})

describe('optimistic insert (handoff.created → applyCreated)', () => {
  beforeEach(() => useHandoffs.getState().reset())

  it('inserts the new card at the front without a refetch', () => {
    useHandoffs.setState({ cards: [card('a')] })
    useHandoffs.getState().applyCreated(card('b'))
    expect(useHandoffs.getState().cards?.map((c) => c.id)).toEqual(['b', 'a'])
  })

  it('reconciles with the authoritative refetch — same id never duplicates', () => {
    useHandoffs.setState({ cards: [card('a')] })
    useHandoffs.getState().applyCreated(card('a'))
    expect(useHandoffs.getState().cards).toHaveLength(1)
  })

  it('is a no-op before the first load (nothing to be optimistic about)', () => {
    useHandoffs.getState().applyCreated(card('a'))
    expect(useHandoffs.getState().cards).toBeNull()
  })

  it('modal state opens plain, as reply, and as annotate — and resets clean', () => {
    const s = useHandoffs.getState()
    s.openCompose()
    expect(useHandoffs.getState().composeOpen).toBe(true)
    expect(useHandoffs.getState().composeReplyTo).toBeNull()
    s.openCompose(card('p'))
    expect(useHandoffs.getState().composeReplyTo?.id).toBe('p')
    s.openAnnotate(card('p'))
    expect(useHandoffs.getState().annotateFor?.id).toBe('p')
    s.reset()
    expect(useHandoffs.getState().composeOpen).toBe(false)
    expect(useHandoffs.getState().annotateFor).toBeNull()
  })
})

describe('receipt toasts (DESIGN v2: mono detail, auto-dismiss 5s)', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('pushes with the honest push-state detail and auto-dismisses after 5s', () => {
    useToasts.getState().push('Handoff published', receiptDetail('projects/x/h.md', false))
    expect(useToasts.getState().toasts).toMatchObject([
      { title: 'Handoff published', detail: 'projects/x/h.md · will push on next sync' },
    ])
    vi.advanceTimersByTime(5001)
    expect(useToasts.getState().toasts).toEqual([])
  })

  it('dismisses early by id', () => {
    useToasts.getState().push('A')
    useToasts.getState().push('B')
    const [a] = useToasts.getState().toasts
    useToasts.getState().dismiss((a as { id: number }).id)
    expect(useToasts.getState().toasts.map((t) => t.title)).toEqual(['B'])
  })

  it('pushed=true reads as pushed', () => {
    expect(receiptDetail('p.md', true)).toBe('p.md · pushed')
  })
})

describe('route confirm gating (story 7.4 AC3)', () => {
  const preview = (project: string): RoutePreview => ({
    file: '/tmp/x.md',
    destination: '/v/projects/web/api/x.md',
    project,
    meta: { project: project || undefined },
  })

  it('requires a project only while the plan is ambiguous', () => {
    expect(needsProject(null)).toBe(false) // card closed
    expect(needsProject(preview(''))).toBe(true) // ambiguous → primary disabled
    expect(needsProject(preview('web'))).toBe(false)
  })
})
