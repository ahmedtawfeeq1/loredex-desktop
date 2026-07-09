/** Story 2.4: palette keyboard navigation + highlight splitting (pure logic). */
import { describe, expect, it } from 'vitest'
import { clampSelection, moveSelection, splitForHighlight } from './palette-nav'

describe('moveSelection', () => {
  it('walks down and wraps at the end', () => {
    expect(moveSelection(0, 3, 'ArrowDown')).toBe(1)
    expect(moveSelection(2, 3, 'ArrowDown')).toBe(0)
  })
  it('walks up and wraps at the top', () => {
    expect(moveSelection(2, 3, 'ArrowUp')).toBe(1)
    expect(moveSelection(0, 3, 'ArrowUp')).toBe(2)
  })
  it('starts at the top from the unselected state', () => {
    expect(moveSelection(-1, 3, 'ArrowDown')).toBe(0)
  })
  it('empty lists select nothing; other keys are inert', () => {
    expect(moveSelection(0, 0, 'ArrowDown')).toBe(-1)
    expect(moveSelection(1, 3, 'Tab')).toBe(1)
  })
})

describe('clampSelection', () => {
  it('keeps in-range values, resets out-of-range to the top', () => {
    expect(clampSelection(1, 3)).toBe(1)
    expect(clampSelection(5, 3)).toBe(0)
    expect(clampSelection(-1, 3)).toBe(0)
    expect(clampSelection(0, 0)).toBe(-1)
  })
})

describe('splitForHighlight', () => {
  it('marks each term occurrence case-insensitively', () => {
    const parts = splitForHighlight('Rate limiting beats rate anxiety', 'rate')
    expect(parts).toEqual([
      { text: 'Rate', hit: true },
      { text: ' limiting beats ', hit: false },
      { text: 'rate', hit: true },
      { text: ' anxiety', hit: false },
    ])
  })
  it('handles multiple terms and ignores 1-char noise', () => {
    const parts = splitForHighlight('auth and retry budget', 'retry a auth')
    expect(parts.filter((p) => p.hit).map((p) => p.text)).toEqual(['auth', 'retry'])
  })
  it('empty query or text passes through unmarked', () => {
    expect(splitForHighlight('plain', '')).toEqual([{ text: 'plain', hit: false }])
    expect(splitForHighlight('', 'term')).toEqual([{ text: '', hit: false }])
  })
})
