/**
 * Compose-handoff modal (story 7.2) + reply variant (story 7.3): DESIGN v2
 * modal with kind segmented control, project selects, objective, note scope
 * picker (selection order = Reading order) and optional prose. The brief is
 * assembled verbatim by the lib — this form only shapes CreateHandoffInput.
 */
import { useEffect, useState } from 'react'
import { qualifiedId, toVaultRelative } from '../../../../shared/handoff-lanes'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { Modal } from '../../components/Modal'
import { useApp } from '../../stores/app'
import { type HandoffRef, useHandoffs } from '../../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import { receiptDetail, useToasts } from '../../stores/toasts'
import {
  buildCreateInput,
  buildReplyInput,
  type ComposeState,
  composeProblem,
  emptyCompose,
  fulfillsCandidates,
  projectNotes,
  replyCompose,
  vaultProjects,
} from './compose-form'
import { FulfillsPicker } from './FulfillsPicker'

function NoteScopePicker({
  candidates,
  selected,
  onChange,
}: {
  candidates: string[]
  selected: string[]
  onChange: (notes: string[]) => void
}): React.JSX.Element {
  const [filter, setFilter] = useState('')
  const needle = filter.trim().toLowerCase()
  const available = candidates.filter(
    (name) => !selected.includes(name) && (!needle || name.toLowerCase().includes(needle)),
  )
  return (
    <div className="note-scope">
      {selected.length > 0 && (
        <ol className="note-scope-selected" aria-label="Reading order">
          {selected.map((name, i) => (
            <li key={name}>
              <span className="note-scope-name">
                {i + 1}. {name}
              </span>
              <button
                type="button"
                className="button-quiet"
                onClick={() => onChange(selected.filter((n) => n !== name))}
              >
                Remove
              </button>
            </li>
          ))}
        </ol>
      )}
      <input
        className="modal-input"
        placeholder="Filter notes…"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />
      <div className="note-scope-list" role="listbox" aria-label="Notes to include">
        {available.length === 0 ? (
          <p className="note-scope-empty">
            {candidates.length === 0 ? 'No notes in this project yet.' : 'No notes match.'}
          </p>
        ) : (
          available.slice(0, 40).map((name) => (
            <button
              key={name}
              type="button"
              className="note-scope-item"
              onClick={() => onChange([...selected, name])}
            >
              {name}
            </button>
          ))
        )}
      </div>
    </div>
  )
}

function ComposeForm({
  replyTo,
  onClose,
}: {
  replyTo: HandoffRef | null
  onClose: () => void
}): React.JSX.Element {
  const tree = useReader((s) => s.tree)
  const loadTree = useReader((s) => s.loadTree)
  const boardProject = useHandoffs((s) => s.project)
  const cards = useHandoffs((s) => s.cards)
  const loadCards = useHandoffs((s) => s.load)
  const identity = useIdentity((s) => effectiveIdentity(s))
  const setView = useApp((s) => s.setView)
  const [state, setState] = useState<ComposeState>(() => {
    const base = replyTo
      ? replyCompose(replyTo)
      : emptyCompose(boardProject === 'all' ? '' : boardProject)
    // story 8.3 retro-link path: field prefill rides the store, one open only
    return { ...base, ...(useHandoffs.getState().composePrefill ?? {}) }
  })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (tree === null) void loadTree()
  }, [tree, loadTree])

  useEffect(() => {
    if (cards === null) void loadCards() // fulfills picker material (story 8.3)
  }, [cards, loadCards])

  const projects = vaultProjects(tree ?? [])
  const notes = state.fromProject ? projectNotes(tree ?? [], state.fromProject) : []
  const problem = composeProblem(state)
  const patch = (p: Partial<ComposeState>): void => setState((s) => ({ ...s, ...p }))

  async function submit(): Promise<void> {
    if (problem || !identity || busy) return
    setBusy(true)
    setError(null)
    try {
      const result = replyTo
        ? await invoke('handoffs.reply', {
            parentId: qualifiedId(replyTo),
            input: buildReplyInput(state),
            identity,
          })
        : await invoke('handoffs.create', { input: buildCreateInput(state), identity })
      const vaultPath = useApp.getState().identity?.vaultPath ?? ''
      useToasts
        .getState()
        .push(
          replyTo ? 'Reply published' : 'Handoff published',
          receiptDetail(toVaultRelative(result.path, vaultPath), result.pushed),
        )
      onClose()
    } catch (e) {
      // lib validation surfaces here, actionable, never silent (AC4)
      setError(isErrEnvelope(e) ? e.message : String(e))
      setBusy(false)
    }
  }

  return (
    <Modal
      title={replyTo ? 'Reply to handoff' : 'New handoff'}
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={busy ? 'Publishing…' : 'Publish'}
      submitDisabled={problem !== null || !identity || busy}
    >
      {replyTo && (
        <p className="modal-banner">
          Replying to “{replyTo.objective || replyTo.id}”
          <span className="modal-banner-route">
            {state.fromProject} ⟶ {state.toProject}
          </span>
        </p>
      )}
      <div className="modal-row">
        <span className="modal-label">Kind</span>
        <div className="seg-control" role="group" aria-label="Kind">
          {(['request', 'delivery'] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              className="seg-option"
              aria-pressed={state.kind === kind}
              onClick={() => patch({ kind })}
            >
              {kind}
            </button>
          ))}
        </div>
      </div>
      {!replyTo && (
        <>
          <div className="modal-row">
            <span className="modal-label">From</span>
            <select
              className="modal-input"
              value={state.fromProject}
              onChange={(e) => patch({ fromProject: e.target.value, notes: [] })}
            >
              <option value="">Sending project…</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </div>
          <div className="modal-row">
            <span className="modal-label">To</span>
            <select
              className="modal-input"
              value={state.toProject}
              onChange={(e) => patch({ toProject: e.target.value })}
            >
              <option value="">Receiving project…</option>
              {projects
                .filter((p) => p !== state.fromProject)
                .map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
            </select>
          </div>
        </>
      )}
      {state.kind === 'delivery' && state.fromProject && (
        <div className="modal-row">
          <span className="modal-label">Fulfills</span>
          <FulfillsPicker
            candidates={fulfillsCandidates(cards ?? [], state.fromProject)}
            value={state.fulfills}
            onChange={(fulfills) => patch({ fulfills })}
          />
        </div>
      )}
      <div className="modal-row">
        <span className="modal-label">Objective</span>
        <input
          className="modal-input"
          placeholder="What should the other project do?"
          value={state.objective}
          onChange={(e) => patch({ objective: e.target.value })}
        />
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Reading order</span>
        <NoteScopePicker
          candidates={notes}
          selected={state.notes}
          onChange={(n) => patch({ notes: n })}
        />
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Next actions (one per line, optional)</span>
        <textarea
          className="modal-input modal-textarea"
          rows={2}
          value={state.nextActions}
          onChange={(e) => patch({ nextActions: e.target.value })}
        />
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Notes for the reader (optional, verbatim)</span>
        <textarea
          className="modal-input modal-textarea"
          rows={3}
          value={state.body}
          onChange={(e) => patch({ body: e.target.value })}
        />
      </div>
      {!identity && (
        <p className="modal-error">
          Publishing needs an identity.{' '}
          <button
            type="button"
            className="button-quiet"
            onClick={() => {
              onClose()
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

/** Mounted once at App level; opens via the handoffs store (board, cards, ⌘K). */
export function ComposeHandoffModal(): React.JSX.Element | null {
  const open = useHandoffs((s) => s.composeOpen)
  const replyTo = useHandoffs((s) => s.composeReplyTo)
  const closeCompose = useHandoffs((s) => s.closeCompose)
  if (!open) return null
  // key remounts a fresh form per open target — no stale state between opens
  return <ComposeForm key={replyTo?.id ?? 'new'} replyTo={replyTo} onClose={closeCompose} />
}
