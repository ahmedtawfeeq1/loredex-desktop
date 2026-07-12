// @vitest-environment jsdom
import { cleanup, render, screen, fireEvent } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { FontPicker } from './FontPicker'

afterEach(() => cleanup())

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
