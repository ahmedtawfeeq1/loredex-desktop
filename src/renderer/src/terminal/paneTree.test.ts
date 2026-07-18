/**
 * Pane-tree operations for the terminal drawer's VS Code-style splits
 * (terminal-splits blueprint 2026-07-18): split right/down replaces the
 * target leaf with a 0.5 split, close collapses the parent to the sibling,
 * ratios clamp to the 0.15–0.85 band, and untouched subtrees keep their
 * references (immutability contract).
 */
import { describe, expect, it } from 'vitest'
import {
  collectTermIds,
  firstTermId,
  MAX_RATIO,
  MIN_RATIO,
  removePane,
  setRatio,
  splitPane,
  type Pane,
} from './paneTree'

const leaf = (id: string): Pane => ({ kind: 'term', id })

/** row(t1, column(t2, t3)) — the canonical nested fixture. */
function nested(): Pane {
  return {
    kind: 'split',
    dir: 'row',
    ratio: 0.5,
    a: leaf('t1'),
    b: { kind: 'split', dir: 'column', ratio: 0.5, a: leaf('t2'), b: leaf('t3') },
  }
}

describe('splitPane', () => {
  it('split right: target stays `a`, the new terminal becomes `b`, ratio 0.5', () => {
    expect(splitPane(leaf('t1'), 't1', 'row', 't2')).toEqual({
      kind: 'split',
      dir: 'row',
      ratio: 0.5,
      a: leaf('t1'),
      b: leaf('t2'),
    })
  })

  it('split down uses dir column', () => {
    const next = splitPane(leaf('t1'), 't1', 'column', 't2')
    expect(next).toMatchObject({ kind: 'split', dir: 'column', ratio: 0.5 })
  })

  it('splits a nested leaf without touching sibling subtrees (same reference)', () => {
    const root = nested()
    const next = splitPane(root, 't3', 'row', 't4')
    expect(next).not.toBe(root)
    expect(next).toMatchObject({
      a: leaf('t1'),
      b: {
        a: leaf('t2'),
        b: { kind: 'split', dir: 'row', ratio: 0.5, a: leaf('t3'), b: leaf('t4') },
      },
    })
    // untouched branch keeps its reference — cheap React reconciliation
    expect((next as Extract<Pane, { kind: 'split' }>).a).toBe(
      (root as Extract<Pane, { kind: 'split' }>).a,
    )
  })

  it('an absent target id returns the SAME root reference (no-op)', () => {
    const root = nested()
    expect(splitPane(root, 'nope', 'row', 't4')).toBe(root)
  })
})

describe('removePane (close pane)', () => {
  it('the parent split collapses to the surviving sibling', () => {
    const root = splitPane(leaf('t1'), 't1', 'row', 't2')
    expect(removePane(root, 't2')).toEqual(leaf('t1'))
    expect(removePane(root, 't1')).toEqual(leaf('t2'))
  })

  it('a nested close collapses only its own split; siblings keep references', () => {
    const root = nested()
    const next = removePane(root, 't2')
    expect(next).toEqual({ kind: 'split', dir: 'row', ratio: 0.5, a: leaf('t1'), b: leaf('t3') })
    expect((next as Extract<Pane, { kind: 'split' }>).a).toBe(
      (root as Extract<Pane, { kind: 'split' }>).a,
    )
  })

  it('removing the last pane returns null (caller hides the drawer)', () => {
    expect(removePane(leaf('t1'), 't1')).toBeNull()
  })

  it('an absent id returns the SAME root reference (no-op)', () => {
    const root = nested()
    expect(removePane(root, 'nope')).toBe(root)
  })
})

describe('setRatio', () => {
  it('clamps into the 0.15–0.85 band; in-band values pass through', () => {
    const root = splitPane(leaf('t1'), 't1', 'row', 't2')
    expect((setRatio(root, [], 0.05) as Extract<Pane, { kind: 'split' }>).ratio).toBe(MIN_RATIO)
    expect((setRatio(root, [], 0.95) as Extract<Pane, { kind: 'split' }>).ratio).toBe(MAX_RATIO)
    expect((setRatio(root, [], 0.3) as Extract<Pane, { kind: 'split' }>).ratio).toBe(0.3)
  })

  it('a non-finite drag value falls back to 0.5 (never a broken layout)', () => {
    const root = splitPane(leaf('t1'), 't1', 'row', 't2')
    expect((setRatio(root, [], Number.NaN) as Extract<Pane, { kind: 'split' }>).ratio).toBe(0.5)
  })

  it('only touches the addressed split — the root ratio and siblings survive', () => {
    const root = nested()
    const next = setRatio(root, ['b'], 0.05) as Extract<Pane, { kind: 'split' }>
    expect(next.ratio).toBe(0.5) // root untouched
    expect(next.b).toMatchObject({ kind: 'split', ratio: MIN_RATIO })
    expect(next.a).toBe((root as Extract<Pane, { kind: 'split' }>).a)
  })

  it('a path landing on a leaf is a no-op (same reference)', () => {
    const root = nested()
    expect(setRatio(root, ['a'], 0.3)).toBe(root)
  })
})

describe('collectTermIds / firstTermId', () => {
  it('collects every id left-to-right on a nested tree', () => {
    expect(collectTermIds(nested())).toEqual(['t1', 't2', 't3'])
    expect(collectTermIds(leaf('only'))).toEqual(['only'])
  })

  it('firstTermId walks the `a` spine to the top-left-most terminal', () => {
    expect(firstTermId(nested())).toBe('t1')
    const deep = splitPane(nested(), 't1', 'column', 't0') // t1 stays `a` — still first
    expect(firstTermId(deep)).toBe('t1')
  })
})
