/**
 * Thread rail (story 8.2, DESIGN v2 card spec): ancestors above the focused
 * handoff, replies (comments included, styled lighter) as a left-indented rail
 * of connected cards on a 2px hairline connector. Broken references render as
 * diagnostic chips — never auto-created, never a crash. Story 8.3 adds the
 * fulfills labeled connector + FULFILLED badge from the same derived thread.
 */
import { useCallback, useEffect, useState } from 'react'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import type { HandoffThread, ThreadCard } from '../../../../shared/types'
import { invoke, onEvent } from '../../api'
import { StatusChip } from '../../components/StatusChip'
import { useReader } from '../../stores/reader'

function ThreadCardRow({ node }: { node: ThreadCard }): React.JSX.Element {
  const comment = node.kind === 'comment'
  return (
    <div
      className={`thread-card${comment ? ' thread-card-comment' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => void useReader.getState().open(node.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) {
          void useReader.getState().open(node.path)
        }
      }}
    >
      <div className="thread-card-top">
        {comment ? (
          <span className="status-chip chip-consumed">comment</span>
        ) : (
          <>
            <StatusChip status={node.status} />
            {node.kind === 'request' && <span className="status-chip chip-request">request</span>}
          </>
        )}
        {!comment && (
          <span className="handoff-route">
            {node.from} ⟶ {node.to}
          </span>
        )}
        <span className="handoff-date">{node.date}</span>
      </div>
      <p className="thread-card-objective">{node.objective || node.id}</p>
    </div>
  )
}

/** The rail under an open handoff brief; `id` is the qualified handoff id. */
export function ThreadRail({ id }: { id: string }): React.JSX.Element | null {
  const [thread, setThread] = useState<HandoffThread | null>(null)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (): Promise<void> => {
    try {
      setThread(await invoke('handoffs.thread', { id }))
      setError(null)
    } catch (e) {
      setThread(null)
      setError(isErrEnvelope(e) ? e.message : String(e))
    }
  }, [id])

  useEffect(() => {
    void load()
    // AC5: live refresh — new notes, transitions, and any vault change
    return onEvent((e) => {
      if (
        e.kind === 'handoff.created' ||
        e.kind === 'handoff.stateChanged' ||
        e.kind === 'vault.changed'
      ) {
        void load()
      }
    })
  }, [load])

  if (error) return <p className="thread-diagnostic">thread unavailable — {error}</p>
  if (!thread) return null
  const empty =
    thread.ancestors.length === 0 &&
    thread.replies.length === 0 &&
    !thread.fulfills &&
    thread.fulfilledBy.length === 0 &&
    thread.broken.length === 0
  if (empty) return null

  return (
    <section className="thread" aria-label="Thread">
      <h2 className="thread-title">Thread</h2>
      {/* story 8.3 AC3/AC4: derived FULFILLED badge + labeled connector —
          the request's own status is never auto-written */}
      {thread.fulfilledBy.length > 0 && (
        <div className="thread-fulfills">
          <span className="thread-edge-label">
            <span className="status-chip chip-fulfilled">fulfilled</span> ⟵ by
          </span>
          {thread.fulfilledBy.map((node) => (
            <ThreadCardRow key={node.path} node={node} />
          ))}
        </div>
      )}
      {thread.fulfills && (
        <div className="thread-fulfills">
          <span className="thread-edge-label">fulfills ⟶</span>
          <ThreadCardRow node={thread.fulfills} />
        </div>
      )}
      {thread.ancestors.map((node) => (
        <ThreadCardRow key={node.path} node={node} />
      ))}
      {(thread.ancestors.length > 0 || thread.replies.length > 0) && (
        <p className="thread-focus">this note</p>
      )}
      {thread.replies.length > 0 && (
        <div className="thread-rail">
          {thread.replies.map((node) => (
            <div key={node.path} style={{ marginLeft: (node.depth - 1) * 20 }}>
              <ThreadCardRow node={node} />
            </div>
          ))}
        </div>
      )}
      {thread.broken.map((b) => (
        <p key={`${b.ownerId}:${b.field}:${b.name}`} className="thread-diagnostic">
          {b.field} ⟶ “{b.name}” on {b.ownerId} no longer resolves
        </p>
      ))}
    </section>
  )
}
