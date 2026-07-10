/**
 * Pure inline-comment view logic (story 16.4, Addendum D1): anchored vs
 * orphaned split and the rail's relative timestamps. Anchors are matched in
 * the same space they were captured in — the rendered text — with the
 * markdown source as fallback (agent-authored comments may quote source).
 */
import type { NoteComment } from '../../../../shared/types'

export interface SplitComments {
  /** anchor found — soft gold underline-highlight + margin rail card */
  anchored: NoteComment[]
  /** quote no longer found — listed at note end with the rust chip */
  orphaned: NoteComment[]
}

/** Split comments by whether their exact anchor still appears in the note. */
export function splitComments(comments: NoteComment[], haystacks: string[]): SplitComments {
  const anchored: NoteComment[] = []
  const orphaned: NoteComment[] = []
  for (const comment of comments) {
    if (haystacks.some((h) => h.includes(comment.anchor))) anchored.push(comment)
    else orphaned.push(comment)
  }
  return { anchored, orphaned }
}

/** Rail order: by first anchor occurrence in the note, ties by time. */
export function byAnchorPosition(comments: NoteComment[], text: string): NoteComment[] {
  return [...comments].sort((a, b) => {
    const pa = text.indexOf(a.anchor)
    const pb = text.indexOf(b.anchor)
    if (pa !== pb) return (pa === -1 ? Number.MAX_SAFE_INTEGER : pa) - (pb === -1 ? Number.MAX_SAFE_INTEGER : pb)
    return a.at.localeCompare(b.at)
  })
}

/** "just now" / "5m ago" / "3h ago" / "2d ago", falling back to the date. */
export function relativeTime(iso: string, nowMs: number): string {
  const then = Date.parse(iso.length === 10 ? `${iso}T00:00:00` : iso)
  if (Number.isNaN(then)) return iso
  const mins = Math.floor((nowMs - then) / 60_000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.floor(hours / 24)
  if (days < 14) return `${days}d ago`
  return iso.slice(0, 10)
}

/** Truncated anchor quote for cards/chips — never a wall of text. */
export function anchorPreview(anchor: string, max = 90): string {
  const flat = anchor.replace(/\s+/g, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1)}…`
}
