/**
 * Route confirm card (story 7.4 AC2-4): planned destination + invented
 * frontmatter BEFORE anything is written, move|copy segmented control, and a
 * required project select when the plan is ambiguous. DESIGN v2 modal spec.
 */
import { toVaultRelative } from '../../../../shared/handoff-lanes'
import { Modal } from '../../components/Modal'
import { useApp } from '../../stores/app'
import { needsProject, useRoute } from '../../stores/route'
import { useReader } from '../../stores/reader'
import { formatValue } from '../reader/NoteView'
import { vaultProjects } from '../handoffs/compose-form'

export function RouteConfirmCard(): React.JSX.Element | null {
  const preview = useRoute((s) => s.preview)
  const file = useRoute((s) => s.file)
  const mode = useRoute((s) => s.mode)
  const projectName = useRoute((s) => s.projectName)
  const busy = useRoute((s) => s.busy)
  const error = useRoute((s) => s.error)
  const setMode = useRoute((s) => s.setMode)
  const setProjectName = useRoute((s) => s.setProjectName)
  const confirm = useRoute((s) => s.confirm)
  const cancel = useRoute((s) => s.cancel)
  const tree = useReader((s) => s.tree)
  const vaultPath = useApp((s) => s.identity?.vaultPath ?? '')

  if (!preview || !file) return null

  const ambiguous = needsProject(preview)
  const projects = vaultProjects(tree ?? [])
  const meta = Object.entries(preview.meta).filter(([, v]) => v !== undefined && v !== null)

  return (
    <Modal
      title="Route this note?"
      onClose={cancel}
      onSubmit={() => void confirm()}
      submitLabel={busy ? 'Routing…' : 'Route'}
      submitDisabled={busy || ambiguous}
    >
      <div className="modal-row">
        <span className="modal-label">Mode</span>
        <div className="seg-control" role="group" aria-label="Mode">
          {(['move', 'copy'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className="seg-option"
              aria-pressed={mode === m}
              onClick={() => void setMode(m)}
            >
              {m}
            </button>
          ))}
        </div>
        <span className="modal-hint">
          {mode === 'move' ? 'the original is removed' : 'the original stays, stamped as routed'}
        </span>
      </div>
      {ambiguous && (
        <div className="modal-row">
          <span className="modal-label">Project</span>
          <select
            className="modal-input"
            value={projectName}
            onChange={(e) => void setProjectName(e.target.value)}
          >
            <option value="">This file names no project — pick one…</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </div>
      )}
      <div className="modal-row modal-row-block">
        <span className="modal-label">Route</span>
        <p className="route-line">
          {file}
          <br />⟶ {toVaultRelative(preview.destination, vaultPath)}
        </p>
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Frontmatter it will carry</span>
        <div className="frontmatter">
          <table>
            <tbody>
              {meta.map(([key, value]) => (
                <tr key={key}>
                  <td className="fm-key">{key}</td>
                  <td>{formatValue(value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      {error && <p className="modal-error">{error}</p>}
    </Modal>
  )
}
