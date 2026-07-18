// @vitest-environment jsdom
/**
 * Step A2: a tool row with a diff expands to a two-column before/after view; a
 * file-ref for a .md location relativizes the ABSOLUTE ACP path and opens the
 * note in the reader (only .md targets — a code file's ref is inert). The bridge
 * (window.loredex.invoke) is mocked; useReader.open is spied by swapping the
 * store method (the zustand way).
 */
import { cleanup, fireEvent, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AcpChatItem } from '../stores/agentPanel'
import { useReader } from '../stores/reader'
import { ToolCallRow } from './ToolCallRow'

type ToolItem = Extract<AcpChatItem, { type: 'tool' }>

const invoke = vi.fn()
window.loredex = {
  invoke,
  onEvent: () => () => {},
} as unknown as typeof window.loredex

beforeEach(() => {
  invoke.mockReset()
  // vault.relativize maps the absolute path to its vault-relative form
  invoke.mockImplementation((ch: string, arg: { path: string }) =>
    ch === 'vault.relativize'
      ? Promise.resolve({ rel: arg.path.replace('/vault/', '') })
      : Promise.resolve(undefined),
  )
})

afterEach(() => cleanup())

describe('ToolCallRow (A2: diffs + file-ref → open note)', () => {
  it('renders the before/after diff columns (old rust, new ok)', () => {
    const item: ToolItem = {
      type: 'tool',
      toolCallId: 't1',
      title: 'Edit notes/x.md',
      status: 'completed',
      content: [{ kind: 'diff', path: '/vault/notes/x.md', oldText: 'the old line', newText: 'the new line' }],
    }
    const { container } = render(<ToolCallRow item={item} />)
    const old = container.querySelector('.tool-diff-old')
    const neu = container.querySelector('.tool-diff-new')
    expect(old?.textContent).toBe('the old line')
    expect(neu?.textContent).toBe('the new line')
  })

  it('clicking a .md location relativizes the absolute path and opens the note in the reader', async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    useReader.setState({ open })
    const item: ToolItem = {
      type: 'tool',
      toolCallId: 't2',
      title: 'Read notes/x.md',
      status: 'completed',
      locations: [{ path: '/vault/notes/x.md', line: 12 }],
    }
    const { container } = render(<ToolCallRow item={item} />)
    const ref = container.querySelector<HTMLButtonElement>('.agent-tool-ref')
    expect(ref).not.toBeNull()
    fireEvent.click(ref as HTMLButtonElement)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('vault.relativize', { path: '/vault/notes/x.md' })
      expect(open).toHaveBeenCalledWith('notes/x.md')
    })
  })

  it('an out-of-vault .md ref relativizes but never navigates the reader (rel === abs)', async () => {
    const open = vi.fn().mockResolvedValue(undefined)
    useReader.setState({ open })
    // outside the vault → the mock (and real toVaultRelative) returns the path
    // unchanged, so rel === abs and open() must NOT be called (else the reader
    // would navigate away and then reject on the absolute path).
    const item: ToolItem = {
      type: 'tool',
      toolCallId: 't5',
      title: 'Read ../sibling/README.md',
      status: 'completed',
      locations: [{ path: '/other/sibling/README.md' }],
    }
    const { container } = render(<ToolCallRow item={item} />)
    const ref = container.querySelector<HTMLButtonElement>('.agent-tool-ref')
    expect(ref?.disabled).toBe(false) // .md → enabled, click is allowed
    fireEvent.click(ref as HTMLButtonElement)
    await waitFor(() => {
      expect(invoke).toHaveBeenCalledWith('vault.relativize', { path: '/other/sibling/README.md' })
    })
    expect(open).not.toHaveBeenCalled()
  })

  it('a non-.md file-ref is inert — disabled, never opens the reader', () => {
    const open = vi.fn()
    useReader.setState({ open })
    const item: ToolItem = {
      type: 'tool',
      toolCallId: 't3',
      title: 'Read src/main.ts',
      status: 'completed',
      locations: [{ path: '/vault/src/main.ts' }],
    }
    const { container } = render(<ToolCallRow item={item} />)
    const ref = container.querySelector<HTMLButtonElement>('.agent-tool-ref')
    expect(ref?.disabled).toBe(true)
    if (ref) fireEvent.click(ref)
    expect(invoke).not.toHaveBeenCalled()
    expect(open).not.toHaveBeenCalled()
  })

  it('a tool row with no output stays the plain mono line (no <details>)', () => {
    const item: ToolItem = { type: 'tool', toolCallId: 't4', title: 'Grep TODO', status: 'in_progress' }
    const { container } = render(<ToolCallRow item={item} />)
    expect(container.querySelector('.agent-tool-line')).not.toBeNull()
    expect(container.querySelector('details')).toBeNull()
  })
})
