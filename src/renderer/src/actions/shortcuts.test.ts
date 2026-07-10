/**
 * Story 15.3 (AC1/AC5): the pure shortcut matcher — combos, the typing guard,
 * the overlay guard, and the ⌘K exemption.
 */
import { describe, expect, it } from 'vitest'
import type { AppAction } from './registry'
import { isTypingTarget, matchShortcut, type KeyStroke } from './shortcuts'

const noop = (): void => {}
const actions: AppAction[] = [
  { id: 'view:home', title: 'Go to Home', combo: { key: '1', meta: true }, run: noop },
  { id: 'action:new-handoff', title: 'New handoff…', combo: { key: 'n', meta: true }, run: noop },
  { id: 'action:route-note', title: 'Route…', combo: { key: 'r', meta: true, shift: true }, run: noop },
  { id: 'action:shortcuts', title: 'Shortcuts…', combo: { key: '?' }, run: noop },
  { id: 'action:palette', title: 'Palette', combo: { key: 'k', meta: true }, always: true, run: noop },
  // D1 rails (story 16.2) — the real registry combos, stroke-verified below
  { id: 'action:toggle-sidebar', title: 'Sidebar', combo: { key: '\\', meta: true }, run: noop },
  { id: 'action:toggle-list', title: 'List', combo: { key: '|', meta: true, shift: true }, run: noop },
]

const stroke = (over: Partial<KeyStroke>): KeyStroke => ({
  key: '',
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
})
const calm = { typing: false, overlayOpen: false }

describe('matchShortcut', () => {
  it('matches ⌘1 / ⌘N / ⇧⌘R; Ctrl counts as ⌘ (same rule as the old ⌘K)', () => {
    expect(matchShortcut(stroke({ key: '1', metaKey: true }), actions, calm)?.id).toBe('view:home')
    expect(matchShortcut(stroke({ key: 'n', ctrlKey: true }), actions, calm)?.id).toBe(
      'action:new-handoff',
    )
    expect(
      matchShortcut(stroke({ key: 'R', metaKey: true, shiftKey: true }), actions, calm)?.id,
    ).toBe('action:route-note')
  })

  it('letter/digit chords are shift-exact — ⌘R never fires the ⇧⌘R action', () => {
    expect(matchShortcut(stroke({ key: 'r', metaKey: true }), actions, calm)).toBeNull()
    expect(matchShortcut(stroke({ key: 'n', metaKey: true, shiftKey: true }), actions, calm)).toBeNull()
  })

  it("'?' matches bare (its shift is part of the key), but never while typing", () => {
    expect(matchShortcut(stroke({ key: '?', shiftKey: true }), actions, calm)?.id).toBe(
      'action:shortcuts',
    )
    expect(
      matchShortcut(stroke({ key: '?', shiftKey: true }), actions, { ...calm, typing: true }),
    ).toBeNull()
  })

  it('⌘-combos still fire while typing (a chord is not typing)', () => {
    expect(
      matchShortcut(stroke({ key: '1', metaKey: true }), actions, { ...calm, typing: true })?.id,
    ).toBe('view:home')
  })

  it('an open overlay blocks everything except the `always` action (⌘K)', () => {
    const overlay = { typing: false, overlayOpen: true }
    expect(matchShortcut(stroke({ key: '1', metaKey: true }), actions, overlay)).toBeNull()
    expect(matchShortcut(stroke({ key: '?', shiftKey: true }), actions, overlay)).toBeNull()
    expect(matchShortcut(stroke({ key: 'k', metaKey: true }), actions, overlay)?.id).toBe(
      'action:palette',
    )
  })

  it('D1 rails (story 16.2): ⌘\\ hits the sidebar; ⌘⇧\\ arrives as | and hits the list', () => {
    expect(matchShortcut(stroke({ key: '\\', metaKey: true }), actions, calm)?.id).toBe(
      'action:toggle-sidebar',
    )
    // macOS reports the SHIFTED character for the chord
    expect(
      matchShortcut(stroke({ key: '|', metaKey: true, shiftKey: true }), actions, calm)?.id,
    ).toBe('action:toggle-list')
    // and neither fires bare (no ⌘) or while an overlay owns the keys
    expect(matchShortcut(stroke({ key: '\\' }), actions, calm)).toBeNull()
    expect(
      matchShortcut(stroke({ key: '\\', metaKey: true }), actions, { ...calm, overlayOpen: true }),
    ).toBeNull()
  })

  it('⌥ chords and unbound keys match nothing', () => {
    expect(matchShortcut(stroke({ key: '1', metaKey: true, altKey: true }), actions, calm)).toBeNull()
    expect(matchShortcut(stroke({ key: 'x', metaKey: true }), actions, calm)).toBeNull()
    expect(matchShortcut(stroke({ key: '1' }), actions, calm)).toBeNull() // bare digit ≠ ⌘1
  })
})

describe('isTypingTarget', () => {
  it('inputs, textareas, selects and contenteditable are typing surfaces', () => {
    expect(isTypingTarget({ tagName: 'INPUT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'TEXTAREA' })).toBe(true)
    expect(isTypingTarget({ tagName: 'SELECT' })).toBe(true)
    expect(isTypingTarget({ tagName: 'DIV', isContentEditable: true })).toBe(true)
  })
  it('buttons, svg nodes and null are not', () => {
    expect(isTypingTarget({ tagName: 'BUTTON' })).toBe(false)
    expect(isTypingTarget(null)).toBe(false)
    expect(isTypingTarget(undefined)).toBe(false)
  })
})
