/**
 * Read-only note view: serif title, frontmatter metadata panel, body through
 * the sanctioned markdown pipeline. No edit affordances — v1 product cut.
 */
import { useMemo } from 'react'
import { renderMarkdown } from '../../markdown/pipeline'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { qualifiedId } from '../../../../shared/handoff-lanes'
import { handoffRefFromNote } from '../handoffs/compose-form'
import { attributionLines } from '../handoffs/lifecycle'
import { ReadingOrderInline } from '../handoffs/ReadingOrderInline'
import { ThreadRail } from '../handoffs/ThreadRail'

export function formatValue(value: unknown): string {
  if (Array.isArray(value)) return value.map(String).join(', ')
  if (value instanceof Date) return value.toISOString().slice(0, 10)
  if (typeof value === 'object' && value !== null) return JSON.stringify(value)
  return String(value)
}

export function FrontmatterPanel({
  meta,
}: {
  meta: Record<string, unknown>
}): React.JSX.Element | null {
  const entries = Object.entries(meta).filter(([, v]) => v !== undefined && v !== null)
  if (entries.length === 0) return null
  return (
    <div className="frontmatter">
      <table>
        <tbody>
          {entries.map(([key, value]) => (
            <tr key={key}>
              <td className="fm-key">{key}</td>
              <td>{formatValue(value)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function NoteView(): React.JSX.Element {
  const selected = useReader((s) => s.selected)
  const doc = useReader((s) => s.doc)
  const docError = useReader((s) => s.docError)
  const readingOrder = useReader((s) => s.readingOrder)

  // memoize per note content — a 1 MB note re-renders only when it changes
  const rendered = useMemo(() => (doc ? renderMarkdown(doc.body) : null), [doc])

  if (!selected) {
    return (
      <div className="empty-state" style={{ border: 'none' }}>
        <p>Select a note to read.</p>
      </div>
    )
  }
  if (docError) return <div className="note-error">{docError}</div>
  if (!doc) return <div />

  const title = (selected.split('/').pop() ?? selected).replace(/\.md$/, '')
  // story 7.3 AC1: the open handoff brief is the "detail view" — same actions
  const handoffRef = handoffRefFromNote(selected, doc.meta as Record<string, unknown>)
  return (
    <article className="note">
      <h1 className="note-title">{title}</h1>
      {handoffRef &&
        attributionLines(doc.meta as Record<string, unknown>).map((line) => (
          <p key={line} className="handoff-history">
            {line}
          </p>
        ))}
      {handoffRef && (
        <div className="note-handoff-actions">
          <button
            type="button"
            className="button-secondary button-small"
            onClick={() => useHandoffs.getState().openCompose(handoffRef)}
          >
            Reply
          </button>
          <button
            type="button"
            className="button-secondary button-small"
            onClick={() => useHandoffs.getState().openAnnotate(handoffRef)}
          >
            Comment
          </button>
        </div>
      )}
      <FrontmatterPanel meta={doc.meta as Record<string, unknown>} />
      <div className="note-body">{rendered}</div>
      <ReadingOrderInline targets={readingOrder} from={selected} />
      {handoffRef && <ThreadRail id={qualifiedId(handoffRef)} />}
    </article>
  )
}
