/**
 * D1 amendment (story 16.4 v1.1): comment hover popover — the fast path to a
 * comment. Hovering or keyboard-focusing anchored text floats a --bg-card
 * card above the anchor: comment body, author name, absolute time (mono
 * 11px). Multiple comments on one anchor stack inside the one popover.
 * Position clamps to the pane and flips below the anchor rather than
 * clipping off-window; dismiss on mouseleave/blur/Escape; reduced motion
 * drops the entrance animation (styles.css). The margin rail remains.
 */
import { useLayoutEffect, useRef, useState } from 'react'
import type { NoteComment } from '../../../../shared/types'
import { ANCHOR_TARGET_CLASS } from './anchorHighlight'
import { absoluteTime } from './comments'
import { authorName } from './InlineComments'

/** Hovered anchor's box in pane-relative coordinates (+ viewport top). */
export interface PopoverAnchorBox {
  /** horizontal center of the anchor's first segment, pane-relative */
  centerX: number
  /** anchor top/bottom, pane-relative — where the popover attaches */
  top: number
  bottom: number
  /** anchor top in viewport coordinates — decides the off-window flip */
  viewportTop: number
  paneWidth: number
}

const GAP = 8

/**
 * Clamp the popover into the pane: horizontally within the pane edges,
 * above the anchor when that stays on-window, flipped below otherwise.
 * Pure — exported for node-side tests.
 */
export function clampPopover(
  box: PopoverAnchorBox,
  size: { width: number; height: number },
): { left: number; top: number } {
  const maxLeft = Math.max(box.paneWidth - size.width - GAP, GAP)
  const left = Math.min(Math.max(box.centerX - size.width / 2, GAP), maxLeft)
  const clipsTop = box.viewportTop - size.height - GAP < 0
  return { left, top: clipsTop ? box.bottom + GAP : box.top - size.height - GAP }
}

/** Escape (and only Escape) dismisses — exported for node-side tests. */
export function dismissOnEscape(key: string, dismiss: () => void): void {
  if (key === 'Escape') dismiss()
}

/**
 * True when the pointer/focus moved into the popover or another anchor
 * segment — the popover stays open (duck-typed for node-side tests).
 */
export function keepsPopoverOpen(target: unknown): boolean {
  const el = target as { closest?: (sel: string) => unknown } | null
  return Boolean(el?.closest?.(`.${ANCHOR_TARGET_CLASS}, .comment-popover`))
}

/** The floating card. Renders hidden for one frame to measure, then clamps. */
export function CommentPopover({
  comments,
  box,
  onDismiss,
}: {
  /** every comment on the hovered anchor — they stack inside one popover */
  comments: NoteComment[]
  box: PopoverAnchorBox
  onDismiss: () => void
}): React.JSX.Element | null {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    setPos(clampPopover(box, { width: el.offsetWidth, height: el.offsetHeight }))
  }, [box, comments])
  if (comments.length === 0) return null
  return (
    <div
      ref={ref}
      role="tooltip"
      aria-label="Comments on this text"
      className="comment-popover"
      style={pos ?? { visibility: 'hidden' }}
      onMouseLeave={onDismiss}
    >
      {comments.map((comment) => (
        <div key={comment.path} className="popover-comment">
          <p className="popover-body">{comment.body}</p>
          <div className="popover-meta">
            <span className="popover-author" title={comment.author}>
              {authorName(comment.author)}
            </span>
            <span className="popover-time" title={comment.at}>
              {absoluteTime(comment.at)}
            </span>
          </div>
        </div>
      ))}
    </div>
  )
}
