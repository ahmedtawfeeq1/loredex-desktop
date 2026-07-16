/**
 * Read-mode find bar engine (story epic17.3, DESIGN.md D1 amendment 3).
 * Node-env like the rest of the reader suite: match counting + case toggle,
 * prev/next wrap-around, the Enter/⇧Enter/Esc key map, and — the coexistence
 * DoD — proof that find's Custom Highlight writes ride SEPARATE names from the
 * comment anchor highlight, so an anchored span and a find hit on the SAME
 * text never clobber each other.
 */
import { describe, expect, it } from 'vitest'
import { ANCHOR_HIGHLIGHT_NAME } from './anchorHighlight'
import {
  clearFindHighlights,
  computeMatches,
  counterLabel,
  FIND_CURRENT_HIGHLIGHT_NAME,
  FIND_HIGHLIGHT_NAME,
  findKeyAction,
  navigate,
  writeFindHighlights,
  type HighlightRegistry,
} from './findEngine'

describe('match counting (D1a3)', () => {
  const text = 'The API contract binds the contract writer to the contract.'

  it('counts every non-overlapping occurrence, left-to-right', () => {
    const m = computeMatches(text, 'contract', false)
    expect(m).toHaveLength(3)
    expect(m[0]).toEqual({ start: 8, end: 16 })
    // offsets are monotonic and non-overlapping
    expect(m[1]!.start).toBeGreaterThanOrEqual(m[0]!.end)
    expect(m[2]!.start).toBeGreaterThanOrEqual(m[1]!.end)
  })

  it('an empty / whitespace-free-of-hits query yields no matches', () => {
    expect(computeMatches(text, '', false)).toEqual([])
    expect(computeMatches(text, 'zzz', false)).toEqual([])
  })

  it('non-overlapping: "aa" in "aaaa" is two matches, not three', () => {
    expect(computeMatches('aaaa', 'aa', false)).toHaveLength(2)
  })
})

describe('case toggle (D1a3)', () => {
  const text = 'API api Api aPi'

  it('case-insensitive by default matches every casing', () => {
    expect(computeMatches(text, 'api', false)).toHaveLength(4)
  })

  it('case-sensitive matches only the exact casing', () => {
    expect(computeMatches(text, 'api', true)).toHaveLength(1)
    expect(computeMatches(text, 'API', true)).toHaveLength(1)
  })
})

describe('navigation wrap-around (D1a3)', () => {
  it('next wraps past the last match back to the first', () => {
    expect(navigate(0, 3, 1)).toBe(1)
    expect(navigate(2, 3, 1)).toBe(0) // wrap forward
  })

  it('prev wraps before the first match to the last', () => {
    expect(navigate(0, 3, -1)).toBe(2) // wrap backward
    expect(navigate(1, 3, -1)).toBe(0)
  })

  it('no matches → no current index', () => {
    expect(navigate(0, 0, 1)).toBe(-1)
    expect(navigate(-1, 0, -1)).toBe(-1)
  })

  it('the counter reads 1-indexed, 0/0 when empty', () => {
    expect(counterLabel(0, 17)).toBe('1/17')
    expect(counterLabel(16, 17)).toBe('17/17')
    expect(counterLabel(-1, 0)).toBe('0/0')
  })
})

describe('find-input key map (Enter/⇧Enter/Esc)', () => {
  it('Enter steps next, ⇧Enter steps prev, Esc closes', () => {
    expect(findKeyAction('Enter', false)).toBe('next')
    expect(findKeyAction('Enter', true)).toBe('prev')
    expect(findKeyAction('Escape', false)).toBe('close')
  })

  it('other keys are not find actions (typing falls through)', () => {
    expect(findKeyAction('a', false)).toBeNull()
    expect(findKeyAction('ArrowDown', false)).toBeNull()
  })
})

/** A Map-backed stand-in for CSS.highlights, so registry writes are testable. */
function fakeRegistry(): { reg: HighlightRegistry; store: Map<string, unknown> } {
  const store = new Map<string, unknown>()
  return {
    store,
    reg: {
      set: (name, hl) => void store.set(name, hl),
      delete: (name) => void store.delete(name),
    },
  }
}

class FakeHighlight {
  ranges: unknown[]
  constructor(...ranges: unknown[]) {
    this.ranges = ranges
  }
}

const asRange = (id: string): Range => ({ id }) as unknown as Range
const Ctor = FakeHighlight as unknown as new (...r: Range[]) => unknown

describe('coexistence with the comment anchor highlight (DoD)', () => {
  it('find rides names distinct from the anchor highlight', () => {
    expect(FIND_HIGHLIGHT_NAME).not.toBe(ANCHOR_HIGHLIGHT_NAME)
    expect(FIND_CURRENT_HIGHLIGHT_NAME).not.toBe(ANCHOR_HIGHLIGHT_NAME)
    expect(FIND_HIGHLIGHT_NAME).not.toBe(FIND_CURRENT_HIGHLIGHT_NAME)
  })

  it('the same text can be BOTH an anchored comment and a find hit', () => {
    // an anchored comment lives over "API contract"; the user searches "contract"
    const text = 'The API contract is the seam.'
    const anchor = 'API contract'
    const anchorAt = text.indexOf(anchor)
    const hits = computeMatches(text, 'contract', false)
    expect(hits).toHaveLength(1)
    // the find hit sits INSIDE the anchored span — both are derivable from the
    // one text stream, painted by two independent Custom Highlight names
    expect(hits[0]!.start).toBeGreaterThanOrEqual(anchorAt)
    expect(hits[0]!.end).toBeLessThanOrEqual(anchorAt + anchor.length)
  })

  it('writing/clearing find never touches the anchor highlight entry', () => {
    const { reg, store } = fakeRegistry()
    // the anchor highlight is already applied over the shared text
    store.set(ANCHOR_HIGHLIGHT_NAME, new FakeHighlight(asRange('anchor')))

    // apply find: all matches (minus current) + the accent current match
    writeFindHighlights(reg, [asRange('m0'), asRange('m2')], asRange('m1'), Ctor)
    expect(store.has(FIND_HIGHLIGHT_NAME)).toBe(true)
    expect(store.has(FIND_CURRENT_HIGHLIGHT_NAME)).toBe(true)
    // the anchor entry is untouched — neither clobbers the other
    expect(store.has(ANCHOR_HIGHLIGHT_NAME)).toBe(true)

    // closing find deletes ONLY the find names; the anchor highlight survives
    clearFindHighlights(reg)
    expect(store.has(FIND_HIGHLIGHT_NAME)).toBe(false)
    expect(store.has(FIND_CURRENT_HIGHLIGHT_NAME)).toBe(false)
    expect(store.has(ANCHOR_HIGHLIGHT_NAME)).toBe(true)
  })

  it('an all-empty match set clears the all-name but keeps a lone current', () => {
    const { reg, store } = fakeRegistry()
    store.set(FIND_HIGHLIGHT_NAME, new FakeHighlight(asRange('stale')))
    // one match total → it IS the current, so the all-set is empty
    writeFindHighlights(reg, [], asRange('only'), Ctor)
    expect(store.has(FIND_HIGHLIGHT_NAME)).toBe(false)
    expect(store.has(FIND_CURRENT_HIGHLIGHT_NAME)).toBe(true)
  })
})
