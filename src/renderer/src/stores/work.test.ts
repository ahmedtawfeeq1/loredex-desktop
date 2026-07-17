/** sprintRollup (slice D): latest sprint wins; statuses bucket correctly. */
import { describe, expect, it } from 'vitest'
import type { WorkItem } from '../../../shared/ipc-contract'
import { sprintRollup } from './work'

const item = (status: string, sprint?: string): WorkItem =>
  ({ id: 'x', kind: 'task', status, title: 't', project: 'p', path: '', ...(sprint ? { sprint } : {}) }) as WorkItem

describe('sprintRollup', () => {
  it('rolls up the latest sprint only', () => {
    const r = sprintRollup([
      item('done', 'S11'),
      item('done', 'S12'),
      item('doing', 'S12'),
      item('review', 'S12'),
      item('todo', 'S12'),
      item('backlog', 'S12'),
    ])
    expect(r).toEqual({ sprint: 'S12', done: 1, doing: 2, todo: 2, total: 5 })
  })
  it('no sprints → rolls up everything with sprint null', () => {
    const r = sprintRollup([item('done'), item('todo')])
    expect(r.sprint).toBeNull()
    expect(r.total).toBe(2)
  })
})
