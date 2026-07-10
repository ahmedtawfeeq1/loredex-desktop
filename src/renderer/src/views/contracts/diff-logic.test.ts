/** Story 11.2: unified-diff line classification + empty-state matrix + filter. */
import { describe, expect, it } from 'vitest'
import type { ContractChange } from '../../../../shared/types'
import {
  classifyDiffLine,
  filterByProject,
  projectsOf,
  railDate,
  timelineEmptyState,
} from './diff-logic'

describe('classifyDiffLine', () => {
  it('classifies additions/deletions by prefix', () => {
    expect(classifyDiffLine('+  /users: {}')).toBe('add')
    expect(classifyDiffLine('-  /orders: {}')).toBe('del')
    expect(classifyDiffLine('   unchanged')).toBe('ctx')
    expect(classifyDiffLine('')).toBe('ctx')
  })

  it('file headers are meta, never tinted as changes', () => {
    expect(classifyDiffLine('+++ b/openapi.yaml')).toBe('meta')
    expect(classifyDiffLine('--- a/openapi.yaml')).toBe('meta')
  })

  it('hunks and git headers classify', () => {
    expect(classifyDiffLine('@@ -1,4 +1,6 @@')).toBe('hunk')
    expect(classifyDiffLine('diff --git a/x b/x')).toBe('meta')
    expect(classifyDiffLine('index 3f1a2b..9c0d1e 100644')).toBe('meta')
    expect(classifyDiffLine('commit 0123456789abcdef')).toBe('meta')
    expect(classifyDiffLine('Author: Dana <dana@nimbus.dev>')).toBe('meta')
    expect(classifyDiffLine('Date:   Thu Jul 9')).toBe('meta')
  })
})

describe('empty-state matrix (AC4)', () => {
  it('no roots → point at Settings; roots without matches → plain statement', () => {
    expect(timelineEmptyState(0, 0)).toBe('no-roots')
    expect(timelineEmptyState(2, 0)).toBe('no-matches')
    expect(timelineEmptyState(2, 5)).toBeNull()
    expect(timelineEmptyState(0, 5)).toBeNull() // changes cached from a config-era scan still render
  })
})

const change = (project: string, sha: string): ContractChange => ({
  repoRoot: `/repos/${project}`,
  project,
  file: 'openapi.yaml',
  sha,
  date: '2026-07-09T10:00:00+02:00',
  author: 'Dana',
  subject: 'feat',
  adds: 1,
  dels: 0,
  links: [],
  commitBase: null,
})

describe('project filter', () => {
  const changes = [change('backend', 'a'.repeat(40)), change('mobile', 'b'.repeat(40))]

  it('filters client-side; all passes through', () => {
    expect(filterByProject(changes, 'all')).toHaveLength(2)
    expect(filterByProject(changes, 'backend').map((c) => c.project)).toEqual(['backend'])
    expect(filterByProject(changes, 'ghost')).toHaveLength(0)
  })

  it('projects list is distinct + sorted; rail date is the mono YYYY-MM-DD', () => {
    expect(projectsOf([...changes, change('backend', 'c'.repeat(40))])).toEqual([
      'backend',
      'mobile',
    ])
    expect(railDate('2026-07-09T10:00:00+02:00')).toBe('2026-07-09')
  })
})
