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

function InlineNote({ target, from }: { target: string; from: string }): React.JSX.Element {
  const resolution: LinkResolution | undefined = useCacheEntry(resolveCached(target, from))
  const path = resolution?.status === 'resolved' ? resolution.target : undefined
  return (
    <details className="ro-item" open={false}>
      <summary className="ro-title">{target}</summary>
      {resolution === undefined ? (
        <p className="ro-meta">resolving…</p>
      ) : path ? (
        <InlineNoteBody path={path} />
      ) : resolution.status === 'ambiguous' ? (
        <p className="ro-meta ro-broken">
          ambiguous — {resolution.candidates?.length ?? 0} matches; open it from the tree
        </p>
      ) : (
        <p className="ro-meta ro-broken">not found in this vault</p>
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
