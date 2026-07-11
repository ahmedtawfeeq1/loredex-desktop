/**
 * Comment modal (story 7.3): title + body only. The result is a NEW
 * type:'comment' note filed next to the handoff — the handoff itself is
 * never mutated; the thread rail (story 8.2) renders it.
 */
import { useState } from 'react'
import { qualifiedId, toVaultRelative } from '../../../../shared/handoff-lanes'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { Modal } from '../../components/Modal'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { receiptDetail, useToasts } from '../../stores/toasts'

export function AnnotateModal(): React.JSX.Element | null {
  const target = useHandoffs((s) => s.annotateFor)
  const closeAnnotate = useHandoffs((s) => s.closeAnnotate)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const setView = useApp((s) => s.setView)
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!target) return null

  async function submit(): Promise<void> {
    if (!target || !identity || busy || !title.trim() || !body.trim()) return
    setBusy(true)
    setError(null)
    try {
      const result = await invoke('handoffs.annotate', {
        id: qualifiedId(target),
        title: title.trim(),
        body: body.trim(),
        identity,
      })
      const vaultPath = useApp.getState().identity?.vaultPath ?? ''
      useToasts
        .getState()
        .push('Comment added', receiptDetail(toVaultRelative(result.path, vaultPath), result.pushed))
      setTitle('')
      setBody('')
      setBusy(false)
      closeAnnotate()
    } catch (e) {
      setError(isErrEnvelope(e) ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={`Comment on “${target.objective || target.id}”`}
      onClose={closeAnnotate}
      onSubmit={() => void submit()}
      submitLabel={busy ? 'Adding…' : 'Comment'}
      submitDisabled={!identity || busy || !title.trim() || !body.trim()}
      submitBlockedReason={
        busy
          ? null
          : !identity
            ? 'Set your identity in Settings first.'
            : !title.trim()
              ? 'Add a short title for the comment.'
              : !body.trim()
                ? 'Write the comment body.'
                : null
      }
    >
      <div className="modal-row">
        <span className="modal-label">Title</span>
        <input
          className="modal-input"
          placeholder="One line — what is this about?"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Comment</span>
        <textarea
          className="modal-input modal-textarea"
          rows={4}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
      {!identity && (
        <p className="modal-error">
          Commenting needs an identity.{' '}
          <button
            type="button"
            className="button-quiet"
            onClick={() => {
              closeAnnotate()
              setView('settings')
            }}
          >
            Set it in Settings
          </button>
        </p>
      )}
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  )
}
