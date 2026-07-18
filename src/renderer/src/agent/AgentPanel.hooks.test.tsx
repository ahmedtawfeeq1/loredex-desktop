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
import { useAgentPanel } from '../stores/agentPanel'

afterEach(() => {
  cleanup()
  useAgentPanel.setState({ open: false, sessions: [], activeId: null })
})

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
