// @vitest-environment jsdom
/**
 * Rules-of-Hooks regression (release-blocker, CDP 2026-07-18): opening the panel
 * (⌘J) on a MOUNTED instance must not change the hook count. The bug was an
 * early `if (!open) return` placed BEFORE a block of useRef/useState/useMemo/
 * useEffect hooks, so the closed render ran fewer hooks than the open one —
 * React threw "Rendered more hooks than during the previous render" and unmounted
 * the whole tree to a blank screen. This test mounts the panel closed, then flips
 * `open` on the same instance (the exact ⌘J path) and asserts it renders instead
 * of throwing. renderToStaticMarkup (AgentPanel.test.ts) can't catch this — it
 * only does a single static render, never the closed→open transition.
 */
import { act, cleanup, render } from '@testing-library/react'
import { createElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

// the panel touches the api bridge (pathForFile) + child components that fire on
// mount; stub the bridge so the store/component render in plain jsdom.
vi.mock('../api', () => ({
  invoke: () => Promise.reject(new Error('stub')),
  onEvent: () => () => {},
  pathForFile: () => '',
}))

import { AgentPanel } from './AgentPanel'
import { type AcpSessionView, useAgentPanel } from '../stores/agentPanel'

afterEach(() => {
  cleanup()
  useAgentPanel.setState({ open: false, sessions: [], activeId: null, draft: '', queueKind: 'next' })
})

/** A ready session mid-turn — the state that renders Queue / BTW / Stop. */
function busySession(): AcpSessionView {
  return {
    sessionId: 's1',
    agent: 'claude',
    title: 'New session',
    state: 'ready',
    busy: true,
    items: [],
    plan: [],
  }
}

describe('AgentPanel — Rules of Hooks (⌘J must not crash)', () => {
  it('flipping open false→true on a mounted instance re-renders (no hook-count change)', () => {
    useAgentPanel.setState({ open: false, sessions: [], activeId: null })
    const { container } = render(createElement(AgentPanel))
    // closed with no sessions → renders nothing (the reopen tab needs a session)
    expect(container.querySelector('.agent-panel')).toBeNull()
    // the exact crash path: ⌘J toggles open on the SAME instance
    expect(() =>
      act(() => {
        useAgentPanel.setState({ open: true })
      }),
    ).not.toThrow()
    // the panel is now in the DOM — the tree survived the transition
    expect(container.querySelector('.agent-panel')).not.toBeNull()
    // and back closed again — the reverse transition must also be clean
    expect(() =>
      act(() => {
        useAgentPanel.setState({ open: false })
      }),
    ).not.toThrow()
  })
})

/**
 * BL-30: Queue and BTW were dead by construction. They render only when the
 * session is busy, and `submit()` guarded on `canSend = canCompose && !busy` —
 * so every click that could reach them was refused before it hit the store. The
 * queueing logic downstream was already correct and simply unreachable.
 */
describe('BL-30 — Queue / BTW reach the store while a turn is running', () => {
  function openBusyPanelWithDraft(text: string): HTMLElement {
    useAgentPanel.setState({
      open: true,
      sessions: [busySession()],
      activeId: 's1',
      draft: text,
      queueKind: 'next',
    })
    const { container } = render(createElement(AgentPanel))
    return container as unknown as HTMLElement
  }

  const byText = (root: HTMLElement, label: string): HTMLButtonElement => {
    const btn = [...root.querySelectorAll('button')].find((b) => b.textContent?.trim() === label)
    if (!btn) throw new Error(`no "${label}" button rendered`)
    return btn as HTMLButtonElement
  }

  it('Queue appends a next-kind message and clears the draft', () => {
    const root = openBusyPanelWithDraft('run the second migration')
    act(() => {
      byText(root, 'Queue').click()
    })
    const s = useAgentPanel.getState()
    expect(s.sessions[0].queued).toEqual([{ text: 'run the second migration', kind: 'next' }])
    expect(s.draft).toBe('')
  })

  it('BTW carries the aside intent, not the next-task one', () => {
    const root = openBusyPanelWithDraft('which vault is this writing to?')
    act(() => {
      byText(root, 'BTW').click()
    })
    expect(useAgentPanel.getState().sessions[0].queued).toEqual([
      { text: 'which vault is this writing to?', kind: 'btw' },
    ])
    // the intent is per-message — the next queued one must not inherit 'btw'
    expect(useAgentPanel.getState().queueKind).toBe('next')
  })

  it('mid-turn ↵ queues too — the placeholder promises it', () => {
    const root = openBusyPanelWithDraft('and update the changelog')
    const box = root.querySelector('textarea')
    if (!box) throw new Error('no composer')
    act(() => {
      box.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    expect(useAgentPanel.getState().sessions[0].queued).toEqual([
      { text: 'and update the changelog', kind: 'next' },
    ])
  })

  it('both are disabled with an empty draft (a queued message is text-only)', () => {
    const root = openBusyPanelWithDraft('   ')
    expect(byText(root, 'Queue').disabled).toBe(true)
    expect(byText(root, 'BTW').disabled).toBe(true)
  })
})
