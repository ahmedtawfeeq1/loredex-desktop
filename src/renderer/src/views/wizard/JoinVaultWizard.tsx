/**
 * Join-vault wizard modal (story 13.2): paste clone URL (or arrive pre-filled
 * from a loredex://join deep link) → destination pick → streamed clone progress
 * → shape/schema outcomes. SCHEMA_AHEAD renders as a loud warning banner and
 * the join continues read-mostly; NOT_A_VAULT keeps the clone and says where.
 * The done page carries the skippable project-roots prompt (feeds contract
 * discovery) before the pivot. Paste-URL only — no OAuth anywhere.
 */
import { useWizard } from '../../stores/wizard'
import { Modal } from '../../components/Modal'
import { WizardSteps } from './WizardSteps'

function JoinForm(): React.JSX.Element {
  const joinUrl = useWizard((s) => s.joinUrl)
  const joinBranch = useWizard((s) => s.joinBranch)
  const dest = useWizard((s) => s.dest)
  const setJoinUrl = useWizard((s) => s.setJoinUrl)
  const pickDir = useWizard((s) => s.pickDir)
  return (
    <>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Repository URL</span>
        <input
          className="modal-input"
          placeholder="git@github.com:team/vault.git"
          value={joinUrl}
          onChange={(e) => setJoinUrl(e.target.value)}
        />
        {joinBranch && (
          <p className="modal-hint mono" title="From the loredex://join link">
            branch: {joinBranch}
          </p>
        )}
        <p className="modal-hint">
          Paste your team’s vault repository. Cloning uses your own SSH key or credential helper —
          this app never asks for GitHub login.
        </p>
      </div>
      <div className="modal-row">
        <span className="modal-label">Clone into</span>
        {dest ? (
          <span className="wizard-path mono" title={dest}>
            {dest}
          </span>
        ) : (
          <span className="modal-hint">An empty or new folder.</span>
        )}
        <button type="button" className="button-secondary" onClick={() => void pickDir('join')}>
          {dest ? 'Change…' : 'Choose…'}
        </button>
      </div>
    </>
  )
}

function JoinFailurePanel(): React.JSX.Element | null {
  const failure = useWizard((s) => s.failure)
  if (!failure) return null
  return (
    <div className="wizard-failure">
      <p className="modal-error">{failure.message}</p>
      <p className="modal-hint">{failure.hint}</p>
      {failure.gitOutput && (
        <details className="wizard-git-output">
          <summary>git output</summary>
          <pre className="mono">{failure.gitOutput}</pre>
        </details>
      )}
    </div>
  )
}

/** Skippable post-join prompt (m2 §7.5): where do this team's repos live here? */
function ProjectRootsPrompt(): React.JSX.Element {
  const roots = useWizard((s) => s.roots)
  const addRoot = useWizard((s) => s.addRoot)
  const removeRoot = useWizard((s) => s.removeRoot)
  return (
    <div className="modal-row modal-row-block">
      <span className="modal-label">Where do this team’s repos live on this machine? (optional)</span>
      {roots.length > 0 && (
        <ul className="wizard-roots">
          {roots.map((path) => (
            <li key={path}>
              <span className="wizard-path mono" title={path}>
                {path}
              </span>
              <button type="button" className="button-quiet" onClick={() => removeRoot(path)}>
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
      <div>
        <button type="button" className="button-secondary" onClick={() => void addRoot()}>
          Add project folder…
        </button>
      </div>
      <p className="modal-hint">
        Powers the contract timeline and commit chips. Skippable — Settings has the same map.
      </p>
    </div>
  )
}

export function JoinVaultWizard(): React.JSX.Element | null {
  const flow = useWizard((s) => s.flow)
  const phase = useWizard((s) => s.phase)
  const steps = useWizard((s) => s.steps)
  const joinUrl = useWizard((s) => s.joinUrl)
  const dest = useWizard((s) => s.dest)
  const schemaOk = useWizard((s) => s.schemaOk)
  const failure = useWizard((s) => s.failure)
  const result = useWizard((s) => s.result)
  const pivoting = useWizard((s) => s.pivoting)
  const close = useWizard((s) => s.close)
  const runJoin = useWizard((s) => s.runJoin)
  const backToForm = useWizard((s) => s.backToForm)
  const openVault = useWizard((s) => s.openVault)
  if (flow !== 'join') return null

  const submit =
    phase === 'form'
      ? { label: 'Join vault', disabled: !joinUrl.trim() || !dest, act: () => void runJoin() }
      : phase === 'running'
        ? { label: 'Joining…', disabled: true, act: () => {} }
        : phase === 'done'
          ? {
              label: pivoting ? 'Opening…' : 'Open vault',
              disabled: pivoting,
              act: () => void openVault(result?.vaultPath ?? dest ?? ''),
            }
          : failure?.recovery === 'close'
            ? { label: 'Close', disabled: false, act: close }
            : { label: 'Edit and retry', disabled: false, act: backToForm }

  return (
    <Modal
      title="Join a vault"
      onClose={close}
      onSubmit={submit.act}
      submitLabel={submit.label}
      submitDisabled={submit.disabled}
    >
      {phase === 'form' ? (
        <JoinForm />
      ) : (
        <>
          <WizardSteps steps={steps} />
          {phase === 'failed' && <JoinFailurePanel />}
          {phase === 'done' && (
            <>
              {schemaOk === false && (
                <div className="wizard-schema-banner" role="alert">
                  This vault was written by a NEWER loredex engine than this app supports. Reading
                  is safe; update Loredex Desktop before writing (split-brain risk).
                </div>
              )}
              <p className="wizard-check-ok">
                Joined{result?.vaultPath ? ` at ${result.vaultPath}` : ''} — the reader and board go
                live when you open it.
              </p>
              <ProjectRootsPrompt />
            </>
          )}
        </>
      )}
    </Modal>
  )
}
