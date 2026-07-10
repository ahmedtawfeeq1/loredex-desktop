/**
 * Story 10.4: the §3 resolution table, one test per row — descriptors are
 * pure, so every node type's click target is asserted without a DOM. The
 * source fallback chain and non-GitHub degradation are the honesty tests.
 */
import { describe, expect, it } from 'vitest'
import type { AtlasEdge, AtlasNode } from '../../../../shared/types'
import { stampClass } from './AtlasNodeCard'
import { editorUrl, resolveEdgeTarget, resolveNode } from './resolve'

const node = (over: Partial<AtlasNode> & Pick<AtlasNode, 'id' | 'type' | 'label'>): AtlasNode => ({
  x: 0,
  y: 0,
  ...over,
})

const ctx = { editor: null }

describe('resolveNode — the §3 table, row for row', () => {
  it('note → Reader view on that note', () => {
    const n = node({ id: 'note:a/t/x', type: 'note', label: 'x', path: 'projects/a/t/x.md' })
    expect(resolveNode(n, ctx)).toEqual({ kind: 'reader', path: 'projects/a/t/x.md' })
  })

  it('handoff → the board card surface with the thread rail', () => {
    const n = node({
      id: 'handoff:b/h1',
      type: 'handoff',
      label: 'h1',
      path: 'projects/b/handoffs/h1.md',
    })
    expect(resolveNode(n, ctx)).toEqual({ kind: 'handoff-card', path: 'projects/b/handoffs/h1.md' })
  })

  it('project → drill into the cluster (Learn)', () => {
    expect(resolveNode(node({ id: 'project:alpha', type: 'project', label: 'alpha' }), ctx)).toEqual(
      { kind: 'drill', project: 'alpha' },
    )
  })

  it('source with a local file → editor deep link (scheme per config)', () => {
    const n = node({
      id: 'source:alpha/docs/x.md',
      type: 'source',
      label: 'docs/x.md',
      localPath: '/repos/alpha/docs/x.md',
    })
    expect(resolveNode(n, { editor: null })).toEqual({
      kind: 'external',
      url: 'file:///repos/alpha/docs/x.md',
      via: 'editor',
    })
    expect(resolveNode(n, { editor: 'vscode' })).toEqual({
      kind: 'external',
      url: 'vscode://file/repos/alpha/docs/x.md',
      via: 'editor',
    })
  })

  it('source nowhere local → disabled with copy-path, never a dead click', () => {
    const n = node({
      id: 'source:alpha/docs/x.md',
      type: 'source',
      label: 'docs/x.md',
      localPath: null,
      sourcePath: '/recorded/docs/x.md',
    })
    expect(resolveNode(n, ctx)).toEqual({
      kind: 'copy',
      text: '/recorded/docs/x.md',
      reason: 'repo not on this machine',
    })
  })

  it('commit with a GitHub base → the commit page', () => {
    const n = node({
      id: 'commit:f3a398e',
      type: 'commit',
      label: 'f3a398e',
      sha: 'f3a398e',
      commitBase: 'https://github.com/acme/nimbus',
    })
    expect(resolveNode(n, ctx)).toEqual({
      kind: 'external',
      url: 'https://github.com/acme/nimbus/commit/f3a398e',
      via: 'github',
    })
  })

  it('commit on a non-GitHub remote → mono text + copy-sha (m2 §6)', () => {
    const n = node({
      id: 'commit:abc1234',
      type: 'commit',
      label: 'abc1234',
      sha: 'abc1234',
      commitBase: null,
    })
    expect(resolveNode(n, ctx)).toEqual({
      kind: 'copy',
      text: 'abc1234',
      reason: 'non-GitHub remote',
    })
  })

  it('contract → the timeline filtered to that file', () => {
    const n = node({
      id: 'contract:/repos/b/openapi.yaml',
      type: 'contract',
      label: 'openapi.yaml',
      repoRoot: '/repos/b',
      file: 'openapi.yaml',
    })
    expect(resolveNode(n, ctx)).toEqual({
      kind: 'contract-timeline',
      repoRoot: '/repos/b',
      file: 'openapi.yaml',
    })
  })
})

describe('editorUrl', () => {
  it('system/absent → file://; scheme → <scheme>://file/<abs>', () => {
    expect(editorUrl(null, '/a/b.md')).toBe('file:///a/b.md')
    expect(editorUrl('system', '/a/b.md')).toBe('file:///a/b.md')
    expect(editorUrl('cursor', '/a/b.md')).toBe('cursor://file/a/b.md')
    expect(editorUrl('windsurf', '/a/b.md')).toBe('windsurf://file/a/b.md')
  })
})

describe('resolveEdgeTarget — edge rows of the table', () => {
  const handoff = node({
    id: 'handoff:b/h1',
    type: 'handoff',
    label: 'h1',
    path: 'projects/b/handoffs/h1.md',
  })
  const commit = node({ id: 'commit:f3a398e', type: 'commit', label: 'f3a398e', sha: 'f3a398e' })
  const projectA = node({ id: 'project:a', type: 'project', label: 'a' })
  const projectB = node({ id: 'project:b', type: 'project', label: 'b' })
  const byId = new Map([
    [handoff.id, handoff],
    [commit.id, commit],
    [projectA.id, projectA],
    [projectB.id, projectB],
  ])

  it('route edge → the handoff that created it', () => {
    const edge: AtlasEdge = {
      id: 'route:a->b:h1',
      source: 'project:a',
      target: 'project:b',
      category: 'route',
      handoffId: 'handoff:b/h1',
    }
    expect(resolveEdgeTarget(edge, byId, 'source')).toEqual({ node: handoff })
  })

  it('aggregated route → the receiving project board lane', () => {
    const edge: AtlasEdge = {
      id: 'route-agg:project:a->project:b',
      source: 'project:a',
      target: 'project:b',
      category: 'route',
      openCount: 1,
      totalCount: 3,
    }
    expect(resolveEdgeTarget(edge, byId, 'target')).toEqual({ board: 'b' })
  })

  it('thread edge → the card whose replies_to/fulfills made it', () => {
    const edge: AtlasEdge = {
      id: 'thread:fulfills:handoff:b/h1->commit:x',
      source: 'handoff:b/h1',
      target: 'commit:f3a398e',
      category: 'thread',
      field: 'fulfills',
    }
    expect(resolveEdgeTarget(edge, byId, 'target')).toEqual({ node: handoff })
  })

  it('contract-link edge resolves by direction of click', () => {
    const edge: AtlasEdge = {
      id: 'contract-link:handoff:b/h1->commit:f3a398e',
      source: 'handoff:b/h1',
      target: 'commit:f3a398e',
      category: 'contract-link',
      confidence: 'mentioned',
    }
    expect(resolveEdgeTarget(edge, byId, 'source')).toEqual({ node: handoff })
    expect(resolveEdgeTarget(edge, byId, 'target')).toEqual({ node: commit })
  })

  it('missing endpoints resolve to nothing rather than a dead click', () => {
    const edge: AtlasEdge = {
      id: 'wikilink:x->y',
      source: 'note:gone',
      target: 'note:also-gone',
      category: 'wikilink',
    }
    expect(resolveEdgeTarget(edge, byId, 'source')).toBeNull()
  })
})

describe('stampClass — DESIGN stamp vocabulary', () => {
  it('maps every lifecycle state to its stamp color class', () => {
    expect(stampClass('open', false)).toBe('atlas-stamp-open')
    expect(stampClass('accepted', false)).toBe('atlas-stamp-accepted')
    expect(stampClass('declined', false)).toBe('atlas-stamp-declined')
    expect(stampClass('consumed', false)).toBe('atlas-stamp-consumed')
    expect(stampClass('snoozed', false)).toBe('atlas-stamp-snoozed')
    expect(stampClass('snoozed', true)).toBe('atlas-stamp-open') // expired = due again
    expect(stampClass(undefined, false)).toBe('atlas-stamp-open')
    expect(stampClass('mystery-status', false)).toBe('atlas-stamp-consumed') // unknown: quiet
  })
})
