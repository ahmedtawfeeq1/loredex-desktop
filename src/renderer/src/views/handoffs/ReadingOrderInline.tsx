/**
 * Reading-order notes rendered inline beneath a handoff brief (story 3.2, F5):
 * each referenced note resolves through the story-2.2 link resolution and
 * renders as an expandable section through the sanctioned markdown pipeline.
 */
import { useEffect, useMemo, useState } from 'react'
import type { Doc } from '../../../../shared/ipc-contract'
import type { LinkResolution } from '../../../../shared/types'
import { previewCached, resolveCached } from '../../markdown/resolveCache'
import { renderMarkdown } from '../../markdown/pipeline'
import { useDiagnostics } from '../../stores/diagnostics'

/**
 * Addendum D1: writers used to emit a `## Reading order` heading with zero
 * notes (2026-07-10 defect — reply handoffs carry none). Detect that shape so
 * the reader can render a rust diagnostic line instead of silence.
 */
export function readingOrderEmptied(body: string): boolean {
  const section = body.split(/^#{1,6}\s+Reading order\s*$/im)[1]?.split(/^#{1,6}\s/m)[0]
  if (section === undefined) return false
  return !/\[\[[^[\]]+\]\]/.test(section)
}

function useCacheEntry<T>(entry: { promise: Promise<T>; result?: T }): T | undefined {
  const [, bump] = useState(0)
  useEffect(() => {
    let alive = true
    void entry.promise.then(() => {
      if (alive) bump((n) => n + 1)
    })
    return () => {
      alive = false
    }
  }, [entry])
  return entry.result
}

/**
 * Addendum D1: an unresolved name is plain rust text wired to Link
 * Diagnostics — it reports itself as a diagnostic and click opens the panel.
 */
function UnresolvedName({ name, from }: { name: string; from: string }): React.JSX.Element {
  useEffect(() => {
    if (from) useDiagnostics.getState().report(from, name)
  }, [from, name])
  return (
    <button
      type="button"
      className="ro-unresolved"
      title={`No note in this vault matches “${name}” — click to open Link Diagnostics`}
      onClick={() => useDiagnostics.getState().setOpen(true)}
    >
      {name} — not found in this vault
    </button>
  )
}

function InlineNote({ target, from }: { target: string; from: string }): React.JSX.Element {
  const resolution: LinkResolution | undefined = useCacheEntry(resolveCached(target, from))
  if (resolution?.status === 'broken') return <UnresolvedName name={target} from={from} />
  const path = resolution?.status === 'resolved' ? resolution.target : undefined
  return (
    <details className="ro-item" open={false}>
      <summary className="ro-title">{target}</summary>
      {resolution === undefined ? (
        <p className="ro-meta">resolving…</p>
      ) : path ? (
        <InlineNoteBody path={path} />
      ) : (
        <p className="ro-meta ro-broken">
          ambiguous — {resolution.candidates?.length ?? 0} matches; open it from the tree
        </p>
      )}
    </details>
  )
}

function InlineNoteBody({ path }: { path: string }): React.JSX.Element {
  const doc: Doc | undefined = useCacheEntry(previewCached(path))
  const rendered = useMemo(() => (doc ? renderMarkdown(doc.body) : null), [doc])
  if (!doc) return <p className="ro-meta">loading…</p>
  return (
    <>
      <span className="ro-meta">{path}</span>
      <div className="note-body">{rendered}</div>
    </>
  )
}

export function ReadingOrderInline({
  targets,
  from,
}: {
  targets: string[]
  from: string
}): React.JSX.Element | null {
  if (targets.length === 0) return null
  return (
    <section className="reading-order" aria-label="Reading order">
      <h2 className="ro-heading">Reading order</h2>
      {targets.map((target) => (
        <InlineNote key={target} target={target} from={from} />
      ))}
    </section>
  )
}
