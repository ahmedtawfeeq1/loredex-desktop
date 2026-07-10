/**
 * Story 7.2/7.3 unit tests: validation matrix, payload assembly (notes order
 * preserved, prose verbatim), reply prefill (inverted route, kind default).
 */
import { describe, expect, it } from 'vitest'
import { qualifiedId } from '../../../../shared/handoff-lanes'
import type { TreeNode } from '../../../../shared/types'
import {
  buildCreateInput,
  buildReplyInput,
  composeProblem,
  emptyCompose,
  projectNotes,
  replyCompose,
  vaultProjects,
} from './compose-form'

const file = (name: string, path: string): TreeNode => ({ name, path, kind: 'file' })
const dir = (name: string, path: string, children: TreeNode[]): TreeNode => ({
  name,
  path,
  kind: 'dir',
  children,
})

const TREE: TreeNode[] = [
  file('Start Here - Product', 'Start Here - Product.md'),
  dir('projects', 'projects', [
    dir('web', 'projects/web', [
      file('a-note', 'projects/web/a-note.md'),
      dir('handoffs', 'projects/web/handoffs', [
        file('2026-07-01-handoff-api', 'projects/web/handoffs/2026-07-01-handoff-api.md'),
      ]),
      file('Start Here - web', 'projects/web/Start Here - web.md'),
    ]),
    dir('api', 'projects/api', [file('spec', 'projects/api/spec.md')]),
  ]),
]

describe('tree-derived candidates', () => {
  it('vaultProjects lists the projects/ directories, sorted', () => {
    expect(vaultProjects(TREE)).toEqual(['api', 'web'])
    expect(vaultProjects([])).toEqual([])
  })

  it('projectNotes walks one project recursively and excludes briefs', () => {
    expect(projectNotes(TREE, 'web')).toEqual(['a-note', '2026-07-01-handoff-api'])
    expect(projectNotes(TREE, 'nope')).toEqual([])
  })
})

describe('validation matrix', () => {
  it('walks the blocking problems in order, then clears', () => {
    const s = emptyCompose()
    expect(composeProblem(s)).toContain('sending')
    s.fromProject = 'web'
    expect(composeProblem(s)).toContain('receiving')
    s.toProject = 'web'
    expect(composeProblem(s)).toContain('two different')
    s.toProject = 'api'
    expect(composeProblem(s)).toContain('objective')
    s.objective = '  Ship it  '
    expect(composeProblem(s)).toBeNull()
  })
})

describe('payload assembly', () => {
  it('preserves note selection order and passes prose verbatim', () => {
    const input = buildCreateInput({
      kind: 'request',
      fromProject: 'web',
      toProject: 'api',
      objective: ' Ship it ',
      notes: ['z-last-selected-first', 'a-note'],
      nextActions: ' read this \n\n then that \n',
      body: '  Context paragraph.  ',
    })
    expect(input).toEqual({
      fromProject: 'web',
      toProject: 'api',
      objective: 'Ship it',
      kind: 'request',
      notes: ['z-last-selected-first', 'a-note'], // selection order, untouched
      nextActions: ['read this', 'then that'],
      body: 'Context paragraph.',
    })
  })

  it('omits empty optionals — the lib note stays minimal', () => {
    const input = buildCreateInput({ ...emptyCompose('web'), toProject: 'api', objective: 'x' })
    expect(input).not.toHaveProperty('nextActions')
    expect(input).not.toHaveProperty('body')
  })

  it('reply payload drops the route — the lib derives it from the parent', () => {
    const reply = buildReplyInput({ ...emptyCompose('web'), toProject: 'api', objective: 'x' })
    expect(reply).not.toHaveProperty('fromProject')
    expect(reply).not.toHaveProperty('toProject')
    expect(reply).toMatchObject({ objective: 'x', kind: 'delivery' })
  })
})

describe('reply prefill (story 7.3 AC2)', () => {
  it('inverts the parent route and defaults kind to delivery', () => {
    const s = replyCompose({ from: 'api', to: 'web' })
    expect(s.fromProject).toBe('web') // I received it, so I reply from here
    expect(s.toProject).toBe('api')
    expect(s.kind).toBe('delivery')
  })
})

describe('qualified ids (story 7.3 AC4)', () => {
  it('qualifies by the owning project (cards live in projects/<to>/handoffs)', () => {
    expect(qualifiedId({ id: 'n', to: 'web' })).toBe('web/n')
    expect(qualifiedId({ id: 'n', to: '' })).toBe('n')
  })
})
