// @vitest-environment jsdom
/**
 * v3 §4 primitives (story 26.2): Button emits the stylesheet's button-*
 * classes (single rendering path with legacy class call sites) + the kbd
 * hint; StatusChip is glyph + label, never color alone; Segmented is radio
 * semantics; RowItem carries the two-line anatomy + selected state.
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { AgentChip } from './AgentChip'
import { Button } from './Button'
import { RowItem } from './RowItem'
import { Segmented } from './Segmented'
import { StatusChip } from './StatusChip'

afterEach(() => cleanup())

describe('Button', () => {
  it('maps variants onto the stylesheet classes and defaults type=button', () => {
    const { container } = render(
      <>
        <Button variant="primary">Go</Button>
        <Button>Meh</Button>
        <Button variant="danger">Rm</Button>
        <Button variant="quiet" className="extra">
          q
        </Button>
      </>,
    )
    const btns = container.querySelectorAll('button')
    expect(btns[0]?.className).toBe('button-primary')
    expect(btns[0]?.type).toBe('button')
    expect(btns[1]?.className).toBe('button-secondary')
    expect(btns[2]?.className).toBe('button-destructive')
    expect(btns[3]?.className).toBe('button-quiet extra')
  })
  it('renders the §4 kbd hint inside the button', () => {
    const { container } = render(
      <Button variant="primary" kbd="A">
        Accept
      </Button>,
    )
    const kbd = container.querySelector('kbd.kbd')
    expect(kbd?.textContent).toBe('A')
  })
  it('forwards disabled + click', () => {
    const onClick = vi.fn()
    const { container } = render(
      <>
        <Button onClick={onClick}>ok</Button>
        <Button disabled onClick={onClick}>
          no
        </Button>
      </>,
    )
    const [live, dead] = Array.from(container.querySelectorAll('button'))
    fireEvent.click(live as HTMLButtonElement)
    fireEvent.click(dead as HTMLButtonElement)
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})

describe('StatusChip (glyph + label, never color alone)', () => {
  const glyph = (status: string): string | null | undefined => {
    const { container } = render(<StatusChip status={status} />)
    return container.querySelector('.chip-glyph')?.textContent
  }
  it('carries the §4 glyph per state', () => {
    expect(glyph('accepted')).toBe('✓')
    expect(glyph('declined')).toBe('✕')
    expect(glyph('stale')).toBe('!')
    expect(glyph('expired')).toBe('!')
    expect(glyph('consumed')).toBe('–')
    expect(glyph('open')).toBe('●')
  })
  it('REQUEST is the info-bordered mono chip without a glyph box', () => {
    const { container } = render(<StatusChip status="request" />)
    expect(container.querySelector('.chip-request')).not.toBeNull()
    expect(container.querySelector('.chip-glyph')).toBeNull()
  })
  it('unknown states fall back to the muted glyph chip (M2 forward-compat)', () => {
    const { container } = render(<StatusChip status="someday" />)
    expect(container.querySelector('.chip-consumed')?.textContent).toContain('someday')
  })
  it('label text always renders beside the glyph', () => {
    const { container } = render(<StatusChip status="declined" />)
    expect(container.querySelector('.status-chip')?.textContent).toContain('declined')
  })
})

describe('Segmented', () => {
  it('radio semantics: one pressed option, click reports the value', () => {
    const onChange = vi.fn()
    const { container } = render(
      <Segmented
        ariaLabel="Theme"
        options={[
          { value: 'a', label: 'A' },
          { value: 'b', label: 'B' },
        ]}
        value="a"
        onChange={onChange}
      />,
    )
    const opts = container.querySelectorAll('.seg-option')
    expect(opts[0]?.getAttribute('aria-pressed')).toBe('true')
    expect(opts[1]?.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(opts[1] as Element)
    expect(onChange).toHaveBeenCalledWith('b')
  })
})

describe('RowItem', () => {
  it('two-line anatomy + selected rail state', () => {
    const onActivate = vi.fn()
    const { container } = render(
      <RowItem title="brief" sub="a ⟶ b · GEN-142" glyph="✓" selected onActivate={onActivate} />,
    )
    const row = container.querySelector('.row-item')
    expect(row?.getAttribute('aria-current')).toBe('true')
    expect(container.querySelector('.row-title')?.textContent).toBe('brief')
    expect(container.querySelector('.row-sub')?.textContent).toContain('GEN-142')
    fireEvent.click(row as Element)
    expect(onActivate).toHaveBeenCalled()
  })
})

describe('AgentChip', () => {
  it('live dot is opt-in and announced to AT', () => {
    const { container, rerender } = render(<AgentChip name="claude" meta="2m ago" />)
    expect(container.querySelector('.agent-dot-live')).toBeNull()
    expect(container.querySelector('.sr-only')?.textContent).toBe('idle')
    rerender(<AgentChip name="claude" meta="2m ago" live />)
    expect(container.querySelector('.agent-dot-live')).not.toBeNull()
    expect(container.querySelector('.sr-only')?.textContent).toBe('live')
  })
})
