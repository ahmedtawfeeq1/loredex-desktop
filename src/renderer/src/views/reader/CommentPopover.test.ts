/**
 * D1 amendment (story 16.4 v1.1): comment hover popover. Node-env like the
 * rest of the reader suite — the hover pipeline is simulated end to end:
 * hovered target → anchor resolution → comments for that anchor → rendered
 * popover markup (body, author name, absolute time). Plus stacking of two
 * comments on one anchor, Escape dismiss, and pane clamping / the off-window
 * flip.
 */
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it, vi } from 'vitest'
import type { NoteComment } from '../../../../shared/types'
import { anchorFromEvent } from './anchorHighlight'
import { absoluteTime, commentsForAnchor } from './comments'
import {
  clampPopover,
  CommentPopover,
  dismissOnEscape,
  keepsPopoverOpen,
  type PopoverAnchorBox,
} from './CommentPopover'

/** A hovered event target: a node inside an `.anchor-target` wrapped span. */
function hoverTarget(anchor: string | null): unknown {
  const hit =
    anchor === null
      ? null
      : { getAttribute: (name: string) => (name === 'data-anchor' ? anchor : null) }
  return { closest: (sel: string) => (sel.includes('.anchor-target') ? hit : null) }
}

const box: PopoverAnchorBox = {
  centerX: 400,
  top: 300,
  bottom: 320,
  viewportTop: 300,
  paneWidth: 900,
}

const comments: NoteComment[] = [
  {
    path: 'projects/p/comments/c1.md',
    author: 'Dana Reyes <dana@nimbus.dev>',
    at: '2026-07-10T14:32:00',
    anchor: 'the anchored words',
    body: 'This claim needs a source.',
  },
  {
    path: 'projects/p/comments/c2.md',
    author: 'Omar Farouk <omar@nimbus.dev>',
    at: '2026-07-10T15:05:00',
    anchor: 'some other quote',
    body: 'A comment on different text.',
  },
]

function renderPopover(list: NoteComment[]): string {
  return renderToStaticMarkup(
    createElement(CommentPopover, { comments: list, box, onDismiss: () => {} }),
  )
}

describe('hover → popover (v1.1)', () => {
  it('hovering an anchored span renders its popover: body, author name, absolute time', () => {
    const anchor = anchorFromEvent(hoverTarget('the anchored words'))
    expect(anchor).toBe('the anchored words')
    const out = renderPopover(commentsForAnchor(comments, anchor as string))
    expect(out).toContain('comment-popover')
    expect(out).toContain('This claim needs a source.') // body
    expect(out).toContain('Dana Reyes') // author name, email stripped to title
    expect(out).toContain('2026-07-10 14:32') // absolute time, not relative
    expect(out).toContain('popover-time') // the mono 11px slot
    // the other anchor's comment never leaks into this popover
    expect(out).not.toContain('Omar Farouk')
  })

  it('hovering outside any anchored span resolves no anchor — no popover', () => {
    expect(anchorFromEvent(hoverTarget(null))).toBeNull()
    expect(anchorFromEvent(null)).toBeNull()
    expect(renderPopover([])).toBe('') // zero comments render nothing
  })

  it('two comments on the same anchor stack inside ONE popover, oldest first', () => {
    const stacked = commentsForAnchor(
      [
        { ...comments[0], path: 'b.md', at: '2026-07-10T15:00:00', body: 'second thought' },
        { ...comments[0], path: 'a.md', at: '2026-07-10T09:00:00', body: 'first thought' },
      ] as NoteComment[],
      'the anchored words',
    )
    const out = renderPopover(stacked)
    expect(out.match(/class="comment-popover"/g)).toHaveLength(1)
    expect(out.match(/class="popover-comment"/g)).toHaveLength(2)
    expect(out.indexOf('first thought')).toBeLessThan(out.indexOf('second thought'))
  })

  it('Escape dismisses; other keys never do', () => {
    const dismiss = vi.fn()
    dismissOnEscape('a', dismiss)
    dismissOnEscape('Enter', dismiss)
    expect(dismiss).not.toHaveBeenCalled()
    dismissOnEscape('Escape', dismiss)
    expect(dismiss).toHaveBeenCalledTimes(1)
  })

  it('mouseleave/blur into the popover or an anchor segment keeps it open; anywhere else closes', () => {
    const popoverHit = { closest: (sel: string) => (sel.includes('comment-popover') ? {} : null) }
    expect(keepsPopoverOpen(popoverHit)).toBe(true)
    expect(keepsPopoverOpen(hoverTarget('the anchored words'))).toBe(true)
    expect(keepsPopoverOpen({ closest: () => null })).toBe(false)
    expect(keepsPopoverOpen(null)).toBe(false) // left the window entirely
  })
})

describe('pane clamping (v1.1 — never clipped off-window)', () => {
  const size = { width: 360, height: 120 }

  it('sits centered above the anchor when it fits', () => {
    expect(clampPopover(box, size)).toEqual({ left: 220, top: 300 - 120 - 8 })
  })

  it('clamps to the left and right pane edges', () => {
    expect(clampPopover({ ...box, centerX: 40 }, size).left).toBe(8)
    expect(clampPopover({ ...box, centerX: 880 }, size).left).toBe(900 - 360 - 8)
  })

  it('flips below the anchor when above would clip off the window top', () => {
    const nearTop = clampPopover({ ...box, viewportTop: 60 }, size)
    expect(nearTop.top).toBe(box.bottom + 8)
  })
})

describe('absolute time (v1.1 — the popover shows absolute, not relative)', () => {
  it('formats a full ISO timestamp as YYYY-MM-DD HH:MM', () => {
    expect(absoluteTime('2026-07-10T14:32:07')).toBe('2026-07-10 14:32')
  })

  it('a date-only stamp stays a date; garbage passes through untouched', () => {
    expect(absoluteTime('2026-07-10')).toBe('2026-07-10')
    expect(absoluteTime('not a date')).toBe('not a date')
  })
})
