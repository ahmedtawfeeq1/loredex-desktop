/**
 * Read-only note view: serif title, frontmatter metadata panel, body through
 * the sanctioned markdown pipeline. No edit affordances — v1 product cut.
 */
import { useMemo } from 'react'
import type { Doc } from '../../../../shared/ipc-contract'
import { renderMarkdown } from '../../markdown/pipeline'
import { useDiagnostics } from '../../stores/diagnostics'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { qualifiedId } from '../../../../shared/handoff-lanes'
import { stripDuplicateH1 } from '../home/brief-title'
import { handoffRefFromNote } from '../handoffs/compose-form'
import { attributionLines } from '../handoffs/lifecycle'
import { ContractChips } from '../contracts/ContractChips'
import { ReadingOrderInline, readingOrderEmptied } from '../handoffs/ReadingOrderInline'
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

  if (!selected) {
    return (
      <div className="empty-state" style={{ border: 'none' }}>
        <p>Select a note to read.</p>
      </div>
    )
  }
  if (docError) return <div className="note-error">{docError}</div>
  if (!doc) return <div />
  return <NoteArticle selected={selected} doc={doc} readingOrder={readingOrder} />
}

/** The note itself, props-driven (store-free below NoteView — testable). */
export function NoteArticle({
  selected,
  doc,
  readingOrder,
}: {
  selected: string
  doc: Doc
  readingOrder: string[]
}): React.JSX.Element {
  const title = (selected.split('/').pop() ?? selected).replace(/\.md$/, '')
  // memoize per note content — a 1 MB note re-renders only when it changes.
  // Addendum D1: index/MOC pages never render their H1 twice — a leading H1
  // equal to the chrome title (the filename) is stripped before the pipeline.
  const rendered = useMemo(
    () => renderMarkdown(stripDuplicateH1(doc.body, title)),
    [doc, title],
  )

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
      {/* story 11.3 AC3: the detail view carries the contract chips too */}
      {handoffRef && (
        <div className="note-contracts">
          <ContractChips handoffId={handoffRef.id} />
        </div>
      )}
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
      {/* Addendum D1: a Reading order section never renders as silence — the
          2026-07-10 defect (writers emitted the heading with zero notes) */}
      {readingOrderEmptied(doc.body) && (
        <p className="ro-empty" role="note">
          Reading order lists no notes — this handoff was written without any.{' '}
          <button
            type="button"
            className="ro-empty-action"
            onClick={() => useDiagnostics.getState().setOpen(true)}
          >
            Open Link Diagnostics
          </button>
        </p>
      )}
      <ReadingOrderInline targets={readingOrder} from={selected} />
      {handoffRef && <ThreadRail id={qualifiedId(handoffRef)} />}
    </article>
  )
}
