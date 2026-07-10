/**
 * Pure note-editing helpers (story 16.4, Addendum D1 "Edit mode + inline
 * comments"). No fs, no loredex — engine.ts and handlers compose these.
 *
 * The load-bearing rule: `note.save` is BODY-ONLY. Frontmatter is the agents'
 * surface, so the original `---…---` block is kept byte-for-byte — never
 * parseDoc→serializeDoc round-tripped (gray-matter would reformat YAML
 * quoting/order/comments). An unedited save is a byte-identical file.
 */

import { ipcError } from '../shared/ipc-contract'
import { isManagedKey } from '../shared/properties'

/** The leading frontmatter block including its closing delimiter line. */
const FRONTMATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/

/**
 * Compute the next frontmatter meta for a `note.setFrontmatter` edit (epic20,
 * D1 amendment 7 §C). Pure — no fs, no serialize; engine.ts round-trips the
 * result through the lib. Agents own frontmatter: managed keys are REJECTED
 * (the panel already locks them; this is the server-side guard). `remove`
 * deletes the key; otherwise it is set to `value`.
 */
export function applyFrontmatterEdit(
  meta: Record<string, unknown>,
  key: string,
  value: unknown,
  remove: boolean,
): Record<string, unknown> {
  if (!key.trim()) throw ipcError('INTERNAL', 'a property needs a key')
  if (isManagedKey(key)) {
    throw ipcError('INTERNAL', `"${key}" is managed by loredex and cannot be edited`)
  }
  const next = { ...meta }
  if (remove) delete next[key]
  else next[key] = value
  return next
}

/**
 * Replace a note's body, preserving the frontmatter block verbatim.
 * Files without frontmatter are replaced wholesale (they have no agent
 * surface to protect).
 */
export function spliceBody(raw: string, body: string): string {
  const fm = FRONTMATTER.exec(raw)
  return (fm ? fm[0] : '') + body
}

/** What the reader's margin rail needs from one comment note. */
export interface CommentView {
  author: string
  at: string
  anchor: string
  body: string
}

/**
 * Parse a scanned note into a rail comment view, or null when it is not an
 * anchored comment replying to `parentName`. Anchored only: non-anchored
 * handoff comments already render in the thread rail (story 8.2).
 */
export function commentView(
  meta: Record<string, unknown>,
  body: string,
  parentName: string,
): CommentView | null {
  if (meta.type !== 'comment') return null
  if (String(meta.replies_to ?? '') !== parentName) return null
  const anchor = typeof meta.anchor === 'string' && meta.anchor.length > 0 ? meta.anchor : null
  if (!anchor) return null

  const attribution = /^—\s*(.+)\s*$/m.exec(body)?.[1]?.trim()
  const author =
    typeof meta.author === 'string' && meta.author.trim() ? meta.author.trim() : (attribution ?? '')
  const at =
    typeof meta.created === 'string' && meta.created ? meta.created : String(meta.date ?? '')
  return { author, at, anchor, body: commentProse(body) }
}

/**
 * Strip the compose contract's scaffolding — leading `# ` heading, the
 * `On [[parent]]:` line, the leading anchor blockquote, the trailing `— `
 * attribution — leaving the comment prose. Agent-authored comments that skip
 * the scaffolding pass through trimmed.
 */
export function commentProse(body: string): string {
  const lines = body.split('\n')
  let start = 0
  // leading scaffold region: blanks, one heading, the On-line, the quote
  while (start < lines.length) {
    const line = (lines[start] as string).trim()
    if (line === '' || /^#\s/.test(line) || /^On \[\[.+\]\]:?$/.test(line) || /^>/.test(line)) {
      start += 1
      continue
    }
    break
  }
  let end = lines.length
  while (end > start) {
    const line = (lines[end - 1] as string).trim()
    if (line === '' || /^—\s/.test(line)) {
      end -= 1
      continue
    }
    break
  }
  const prose = lines.slice(start, end).join('\n').trim()
  return prose || body.trim()
}
