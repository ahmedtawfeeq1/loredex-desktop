// @vitest-environment jsdom
/** Plan column mapping (slice E): WorkItem → reference-03 column derivation. */
import { describe, expect, it } from 'vitest'
import type { WorkItem } from '../../../../shared/ipc-contract'
import { boardColumns, columnOf } from './PlanView'

const item = (id: string, kind: WorkItem['kind'], status: string): WorkItem =>
  ({ id, kind, status, title: id, project: 'p', path: '' }) as WorkItem

describe('columnOf', () => {
  it('maps work-item statuses onto the five reference columns', () => {
    expect(columnOf(item('h', 'handoff', 'todo'))).toBe('triage') // open handoff
    expect(columnOf(item('r', 'request', 'todo'))).toBe('triage')
    expect(columnOf(item('t', 'task', 'todo'))).toBe('todo')
    expect(columnOf(item('t', 'task', 'doing'))).toBe('doing')
    expect(columnOf(item('h', 'handoff', 'doing'))).toBe('doing') // accepted
    expect(columnOf(item('t', 'task', 'review'))).toBe('review')
    expect(columnOf(item('t', 'task', 'done'))).toBe('done')
    expect(columnOf(item('h', 'handoff', 'consumed'))).toBe('done')
    expect(columnOf(item('h', 'handoff', 'backlog'))).toBe('backlog') // snoozed → Backlog tab
  })
})

describe('boardColumns', () => {
  it('buckets every non-backlog item exactly once', () => {
    const cols = boardColumns([
      item('open', 'handoff', 'todo'),
      item('task', 'task', 'todo'),
      item('run', 'task', 'doing'),
      item('parked', 'handoff', 'backlog'),
      item('shipped', 'handoff', 'consumed'),
    ])
    expect(cols.triage.map((c) => c.id)).toEqual(['open'])
    expect(cols.todo.map((c) => c.id)).toEqual(['task'])
    expect(cols.doing.map((c) => c.id)).toEqual(['run'])
    expect(cols.review).toEqual([])
    expect(cols.done.map((c) => c.id)).toEqual(['shipped'])
  })
})

import { dropAction } from './PlanView'

describe('dropAction (drag-and-drop, 2026-07-18)', () => {
  it('tasks move freely between their four columns, never to triage', () => {
    expect(dropAction(item('t', 'task', 'todo'), 'doing')).toEqual({ kind: 'task', status: 'doing' })
    expect(dropAction(item('t', 'task', 'review'), 'todo')).toEqual({ kind: 'task', status: 'todo' })
    expect(dropAction(item('t', 'task', 'done'), 'review')).toEqual({ kind: 'task', status: 'review' })
    expect(dropAction(item('t', 'task', 'todo'), 'triage')).toBeNull()
    expect(dropAction(item('t', 'task', 'todo'), 'todo')).toBeNull()
  })
  it('handoffs ride the machine: accept, reopen, consume — nothing else', () => {
    expect(dropAction(item('h', 'handoff', 'todo'), 'doing')).toEqual({ kind: 'accept' })
    expect(dropAction(item('h', 'handoff', 'doing'), 'triage')).toEqual({ kind: 'reopen' })
    expect(dropAction(item('h', 'handoff', 'done'), 'triage')).toEqual({ kind: 'reopen' })
    expect(dropAction(item('h', 'handoff', 'todo'), 'done')).toEqual({ kind: 'consume' })
    expect(dropAction(item('h', 'handoff', 'doing'), 'done')).toEqual({ kind: 'consume' })
    expect(dropAction(item('h', 'handoff', 'todo'), 'review')).toBeNull()
    expect(dropAction(item('h', 'handoff', 'consumed'), 'triage')).toBeNull()
  })
})
