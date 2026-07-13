// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FontPicker } from './FontPicker'

afterEach(() => cleanup())

describe('FontPicker regressions', () => {
  it('resyncs the selection to currentId whenever the picker (re)opens', () => {
    const { rerender } = render(
      <FontPicker open={false} role="body" currentId="sora" onPick={() => {}} onClose={() => {}} />,
    )

    // Opens showing the CURRENT font for the role preselected, not stale state.
    rerender(<FontPicker open role="body" currentId="sora" onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'Sora' }).getAttribute('aria-pressed')).toBe('true')

    // Reopening for a different role/currentId (without the user touching a
    // row) must follow the new currentId — this is what the stale
    // `useState(currentId)` seed used to get wrong.
    rerender(<FontPicker open role="body" currentId="dm-sans" onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByRole('button', { name: 'DM Sans' }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('button', { name: 'Sora' }).getAttribute('aria-pressed')).toBe('false')
  })

  it('moves focus into the dialog on open so Escape can close it', () => {
    render(<FontPicker open role="body" currentId="system" onPick={() => {}} onClose={() => {}} />)
    expect(document.activeElement).toBe(screen.getByRole('dialog'))
  })
})

describe('FontPicker', () => {
  it('lists catalog fonts grouped by category', () => {
    render(<FontPicker open role="body" currentId="system" onPick={() => {}} onClose={() => {}} />)
    expect(screen.getByText('DM Sans')).toBeTruthy()
    expect(screen.getByText('Roboto Mono')).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Sans' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: 'Arabic' })).toBeTruthy()
  })

  it('fires onPick with the chosen id and closes', () => {
    const onPick = vi.fn()
    const onClose = vi.fn()
    render(<FontPicker open role="headings" currentId="system" onPick={onPick} onClose={onClose} />)
    fireEvent.click(screen.getByText('Sora'))
    fireEvent.click(screen.getByRole('button', { name: 'Use this font' }))
    expect(onPick).toHaveBeenCalledWith('sora')
    expect(onClose).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    const { container } = render(<FontPicker open={false} role="body" currentId="system" onPick={() => {}} onClose={() => {}} />)
    expect(container.firstChild).toBeNull()
  })
})
