/**
 * One terminal leaf pane (terminal-splits blueprint 2026-07-18): a host div
 * the imperative xterm instance mounts into, kept fitted by a rAF-throttled
 * ResizeObserver (covers ratio drags, height drags, window resizes, drawer
 * reopen). xterm disposal belongs to closePane/reset — never to unmount
 * (a split remounts leaves; the registry re-parents the live element).
 */
import { useEffect, useRef } from 'react'
import { useTerminal } from '../stores/terminal'
import { attachTerm, fitTerm, focusTerm } from './xtermRegistry'

export function TermPane({ id }: { id: string }): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement>(null)
  const active = useTerminal((s) => s.activeId === id)
  const exitCode: number | undefined = useTerminal((s) => s.exited[id])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    attachTerm(id, host)
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => fitTerm(id))
    })
    ro.observe(host)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect() // the xterm instance outlives the mount (see header)
    }
  }, [id])

  return (
    // biome-ignore lint/a11y: xterm's own textarea inside is the focusable
    // widget; click-to-activate is a pointer affordance (focus follows click)
    <div
      className={active ? 'term-pane term-pane-active' : 'term-pane'}
      onMouseDown={() => {
        useTerminal.getState().setActive(id)
        focusTerm(id)
      }}
      onKeyDownCapture={(e) => {
        // The App shell's global handler treats Ctrl as ⌘ (shortcuts.ts), and
        // the registry owns ⌘E/⌘K/⌘F/⌘N/⌘S/⌘1-9 — all shell/readline keys.
        // Let ⌃` (the toggle) and real ⌘-chords bubble to the global handler;
        // stop bare-ctrl chords so readline keys (⌃E ⌃K ⌃N ⌃F ⌃S…) reach the
        // shell instead of triggering ⌘-aliased app actions.
        if (e.ctrlKey && !e.metaKey && e.key !== '`') e.stopPropagation()
      }}
    >
      <div ref={hostRef} className="term-xterm-host" />
      {exitCode !== undefined && (
        <div
          className={
            exitCode === 0 ? 'term-exit-chip term-exit-ok' : 'term-exit-chip term-exit-err'
          }
        >
          <span className="chip-glyph">▪</span>
          <span>exited · code {exitCode}</span>
          <button
            type="button"
            className="term-exit-close"
            onClick={() => void useTerminal.getState().closePane(id)}
          >
            close
          </button>
        </div>
      )}
    </div>
  )
}
