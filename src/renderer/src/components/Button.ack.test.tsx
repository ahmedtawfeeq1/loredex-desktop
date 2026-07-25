// @vitest-environment jsdom
/**
 * Reported 2026-07-23: "there is no effect for any button" — Copy and Type fired
 * and changed nothing on screen, so a click that worked looked exactly like one
 * that missed. `ack` is the in-button confirmation for actions whose result is
 * otherwise invisible.
 */
import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Button } from './Button'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})
beforeEach(() => vi.useFakeTimers({ shouldAdvanceTime: true }))

const click = (el: Element): void => act(() => void (el as HTMLButtonElement).click())

describe('Button ack', () => {
  it('confirms the click, then goes back to its label', () => {
    const { container } = render(createElement(Button, { ack: 'Copied' }, 'Copy'))
    const btn = container.querySelector('button') as HTMLButtonElement
    expect(btn.textContent).toBe('Copy')

    click(btn)
    expect(btn.textContent).toBe('✓ Copied')
    // glyph + label, never colour alone (§4) — plus a class for the styling
    expect(btn.className).toContain('is-acked')

    act(() => void vi.advanceTimersByTime(1500))
    expect(btn.textContent).toBe('Copy')
    expect(btn.className).not.toContain('is-acked')
  })

  it('still runs the click handler it was given', () => {
    const onClick = vi.fn()
    const { container } = render(createElement(Button, { ack: 'Copied', onClick }, 'Copy'))
    click(container.querySelector('button') as Element)
    expect(onClick).toHaveBeenCalledOnce()
  })

  it('a second click restarts the window rather than ending it early', () => {
    const { container } = render(createElement(Button, { ack: 'Typed' }, 'Type'))
    const btn = container.querySelector('button') as HTMLButtonElement
    click(btn)
    act(() => void vi.advanceTimersByTime(1000))
    click(btn)
    act(() => void vi.advanceTimersByTime(1000))
    expect(btn.textContent).toBe('✓ Typed') // the first timer must not have fired
  })

  it('buttons without ack are untouched — no confirmation, no class', () => {
    const onClick = vi.fn()
    const { container } = render(createElement(Button, { onClick }, 'Save'))
    const btn = container.querySelector('button') as HTMLButtonElement
    click(btn)
    expect(btn.textContent).toBe('Save')
    expect(btn.className).not.toContain('is-acked')
    expect(onClick).toHaveBeenCalledOnce()
  })

  /** A card that flips to "Installed" unmounts its buttons mid-timer. */
  it('unmounting before the window closes does not set state on a dead node', () => {
    const { container, unmount } = render(createElement(Button, { ack: 'Checked' }, 'Verify'))
    click(container.querySelector('button') as Element)
    unmount()
    expect(() => act(() => void vi.advanceTimersByTime(2000))).not.toThrow()
  })
})
