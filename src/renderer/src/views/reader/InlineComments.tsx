/**
 * Inline-comment surfaces (story 16.4, Addendum D1): the right margin rail
 * (composer + anchored cards, author + relative time) and the orphaned list
 * at note end (rust chip — the quote is no longer in the note). Comments are
 * plain vault notes; no deletion in-app v1 (files are the API).
 */
import { Button } from '../../components/Button'
import { useState } from 'react'
import type { NoteComment } from '../../../../shared/types'
import { useComments } from '../../stores/comments'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { anchorPreview, relativeTime } from './comments'

/** `Dana Reyes <dana@nimbus.dev>` → `Dana Reyes` (email stays in the title). */
export function authorName(author: string): string {
  return author.replace(/\s*<[^>]*>\s*$/, '').trim() || author
}

function CommentCard({
  comment,
  orphaned = false,
}: {
  comment: NoteComment
  orphaned?: boolean
}): React.JSX.Element {
  return (
    <div className={orphaned ? 'comment-card comment-orphan' : 'comment-card'}>
      <div className="comment-head">
        {orphaned && <span className="orphan-chip">orphaned</span>}
        <span className="comment-author" title={comment.author}>
          {authorName(comment.author)}
        </span>
        <span className="comment-time" title={comment.at}>
          {relativeTime(comment.at, Date.now())}
        </span>
      </div>
      <p className="comment-quote">“{anchorPreview(comment.anchor)}”</p>
      <p className="comment-text">{comment.body}</p>
    </div>
  )
}

function CommentComposer({ anchor }: { anchor: string }): React.JSX.Element {
  const [body, setBody] = useState('')
  const busy = useComments((s) => s.busy)
  const error = useComments((s) => s.error)
  const identity = useIdentity((s) => effectiveIdentity(s))

  async function submit(): Promise<void> {
    if (!identity) return
    if (await useComments.getState().create(body, identity)) setBody('')
  }

  return (
    <div className="comment-card comment-composer">
      <p className="comment-quote">“{anchorPreview(anchor)}”</p>
      <textarea
        autoFocus
        rows={3}
        className="comment-input"
        aria-label="Comment on the selected text"
        placeholder="Comment — lands as a vault note agents read too"
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') void submit()
          if (e.key === 'Escape') useComments.getState().closeComposer()
        }}
      />
      <div className="comment-actions">
        <Button
          variant="quiet"
          onClick={() => useComments.getState().closeComposer()}>
          Cancel
        </Button>
        <Button
          variant="primary"
          className="button-small"
          disabled={!identity || busy || !body.trim()}
          onClick={() => void submit()}>
          {busy ? 'Adding…' : 'Comment'}
        </Button>
      </div>
      {!identity && <p className="modal-error">Commenting needs an identity — set it in Settings.</p>}
      {error && <p className="modal-error">{error}</p>}
    </div>
  )
}

/** The right margin rail: composer first, then anchored cards in note order. */
export function CommentsRail({
  comments,
  composerAnchor,
}: {
  comments: NoteComment[]
  /** the exact selected text a composer is open for; null = closed */
  composerAnchor: string | null
}): React.JSX.Element | null {
  if (!composerAnchor && comments.length === 0) return null
  return (
    <aside className="comment-rail" aria-label="Comments">
      {composerAnchor && <CommentComposer anchor={composerAnchor} />}
      {comments.map((comment) => (
        <CommentCard key={comment.path} comment={comment} />
      ))}
    </aside>
  )
}

/** Orphaned anchors list at note end — rust chip, quote kept for the trail. */
export function OrphanedComments({
  comments,
}: {
  comments: NoteComment[]
}): React.JSX.Element | null {
  if (comments.length === 0) return null
  return (
    <section className="orphaned-comments" aria-label="Orphaned comments">
      <p className="orphaned-title">Comments on text no longer in this note</p>
      {comments.map((comment) => (
        <CommentCard key={comment.path} comment={comment} orphaned />
      ))}
    </section>
  )
}
