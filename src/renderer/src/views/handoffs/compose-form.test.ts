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
      fulfills: '',
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

// ── story 8.3: fulfills picker + payload ─────────────────────────────────────

import type { HandoffCard } from '../../../../shared/types'
import { fulfilledByMap } from '../../../../shared/handoff-lanes'
import { fulfillsCandidates } from './compose-form'

const handoff = (id: string, extra: Partial<HandoffCard>): HandoffCard => ({
  id,
  name: id,
  from: 'api',
  to: 'web',
  objective: `do ${id}`,
  date: '2026-07-10',
  ageDays: 1,
  status: 'open',
  path: `/v/projects/web/handoffs/${id}.md`,
  readingOrder: [],
  kind: 'delivery',
  expired: false,
  ...extra,
})

describe('fulfills picker filter (story 8.3 AC1/AC5: kind × status × direction)', () => {
  const cards = [
    handoff('open-req', { kind: 'request', status: 'open' }),
    handoff('accepted-req', { kind: 'request', status: 'accepted' }),
    handoff('consumed-req', { kind: 'request', status: 'consumed' }),
    handoff('declined-req', { kind: 'request', status: 'declined' }),
    handoff('snoozed-req', { kind: 'request', status: 'snoozed' }),
    handoff('open-delivery', { kind: 'delivery', status: 'open' }),
    handoff('elsewhere-req', { kind: 'request', status: 'open', to: 'mobile' }),
  ]

  it('lists only open/accepted requests addressed to the sending project', () => {
    expect(fulfillsCandidates(cards, 'web').map((c) => c.id)).toEqual([
      'open-req',
      'accepted-req',
    ])
  })

  it('never lists consumed or declined requests (AC5), nor other directions', () => {
    const ids = fulfillsCandidates(cards, 'web').map((c) => c.id)
    for (const out of ['consumed-req', 'declined-req', 'open-delivery', 'elsewhere-req']) {
      expect(ids).not.toContain(out)
    }
    expect(fulfillsCandidates(cards, 'mobile').map((c) => c.id)).toEqual(['elsewhere-req'])
  })
})

describe('fulfills payload (story 8.3 AC1)', () => {
  it('rides CreateHandoffInput for deliveries and is dropped for requests', () => {
    const state = {
      ...emptyCompose('web'),
      toProject: 'api',
      objective: 'ship it',
      fulfills: 'open-req',
    }
    expect(buildCreateInput(state).fulfills).toBe('open-req')
    expect(buildCreateInput({ ...state, kind: 'request' }).fulfills).toBeUndefined()
    expect(buildCreateInput({ ...state, fulfills: '' }).fulfills).toBeUndefined()
    // reply variant carries it too (retro-link path composes a reply)
    expect(buildReplyInput(state).fulfills).toBe('open-req')
  })
})

describe('fulfilledByMap (story 8.3 AC3: one/many deliveries, dangling names)', () => {
  it('reverses fulfills edges by request id', () => {
    const map = fulfilledByMap([
      handoff('req', { kind: 'request' }),
      handoff('d1', { fulfills: 'req' }),
      handoff('d2', { fulfills: 'req' }),
      handoff('d3', { fulfills: 'gone-request' }),
      handoff('plain', {}),
    ])
    expect(map.get('req')).toEqual(['d1', 'd2'])
    // a dangling name maps to nothing rendered — no request card carries it
    expect(map.get('gone-request')).toEqual(['d3'])
    expect(map.has('plain')).toBe(false)
  })
})
