/**
 * Create-vault wizard modal (story 13.1): DESIGN v2 stepped modal — form page
 * (folder pick, optional remote paste with preflight, identity confirm), then
 * a live progress list fed by wizard.progress events. Every failure names
 * what happened + what to do; failures after scaffold advertise the intact
 * LOCAL vault and the Sync-settings retry path (AC4). Paste-URL only — the
 * app never asks for GitHub login.
 */
import { useWizard } from '../../stores/wizard'
import { useIdentity } from '../../stores/identity'
import { Modal } from '../../components/Modal'
import { IdentityConfirm } from './IdentityConfirm'
import { WizardSteps } from './WizardSteps'

function RemoteCheckLine(): React.JSX.Element | null {
  const check = useWizard((s) => s.remoteCheck)
  const checking = useWizard((s) => s.checkingRemote)
  if (checking) return <p className="modal-hint">Checking remote…</p>
  if (!check) return null
  if (!check.reachable) {
    return (
      <div className="modal-error">
        Could not reach that remote — check the URL or your git credentials (SSH key / credential
        helper); this app never asks for GitHub login.
        {check.message && (
          <details className="wizard-git-output">
            <summary>git output</summary>
            <pre className="mono">{check.message}</pre>
          </details>
        )}
      </div>
    )
  }
  if (!check.empty) {
    return (
      <p className="modal-error">
        That remote already has commits — join it instead of creating a new vault over it.
      </p>
    )
  }
  return (
    <p className="wizard-check-ok">
      Remote reachable and empty{check.defaultBranch ? ` — branch ${check.defaultBranch}` : ''}.
    </p>
  )
}

function CreateForm(): React.JSX.Element {
  const dir = useWizard((s) => s.dir)
  const remoteUrl = useWizard((s) => s.remoteUrl)
  const setRemoteUrl = useWizard((s) => s.setRemoteUrl)
  const pickDir = useWizard((s) => s.pickDir)
  const checkRemote = useWizard((s) => s.checkRemote)
  const checking = useWizard((s) => s.checkingRemote)
  const dexType = useWizard((s) => s.dexType)
  return (
    <>
      <div className="modal-row">
        <span className="modal-label">Folder</span>
        {dir ? (
          <span className="wizard-path mono" title={dir}>
            {dir}
          </span>
        ) : (
          <span className="modal-hint">Where the dex will be created (empty or new).</span>
        )}
        <button type="button" className="button-secondary" onClick={() => void pickDir('create')}>
          {dir ? 'Change…' : 'Choose…'}
        </button>
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Dex type</span>
        <div className="tree-mode" role="group" aria-label="Dex type">
          <button
            type="button"
            aria-pressed={dexType === 'research'}
            onClick={() => useWizard.setState({ dexType: 'research' })}
          >
            Research
          </button>
          <button
            type="button"
            aria-pressed={dexType === 'agent-ops'}
            onClick={() => useWizard.setState({ dexType: 'agent-ops' })}
          >
            Agent ops
          </button>
        </div>
        <p className="modal-hint">
          {dexType === 'agent-ops'
            ? 'A client fleet: Manager ▸ Client ▸ Pipeline/Agent ▸ Stage, with validated scaffolds.'
            : 'AI research notes routed by topic — the default.'}
        </p>
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Remote (optional)</span>
        <div className="wizard-remote-row">
          <input
            className="modal-input"
            placeholder="git@github.com:team/vault.git — or leave empty for local-only"
            value={remoteUrl}
            onChange={(e) => setRemoteUrl(e.target.value)}
          />
          <button
            type="button"
            className="button-quiet"
            disabled={!remoteUrl.trim() || checking}
            onClick={() => void checkRemote()}
          >
            Check
          </button>
        </div>
        <RemoteCheckLine />
        <p className="modal-hint">
          Paste an empty repository URL your team can pull from. No GitHub login — your own SSH key
          or credential helper does the pushing.
        </p>
      </div>
      <div className="modal-row modal-row-block">
        <span className="modal-label">Identity</span>
        <IdentityConfirm />
      </div>
    </>
  )
}

function FailurePanel(): React.JSX.Element | null {
  const failure = useWizard((s) => s.failure)
  if (!failure) return null
  return (
    <div className="wizard-failure">
      <p className="modal-error">{failure.message}</p>
      <p className="modal-hint">{failure.hint}</p>
      {failure.localVaultCreated && (
        <p className="wizard-check-ok">
          A valid local vault was created — remote wiring can be retried from Sync settings.
        </p>
      )}
      {failure.gitOutput && (
        <details className="wizard-git-output">
          <summary>git output</summary>
          <pre className="mono">{failure.gitOutput}</pre>
        </details>
      )}
    </div>
  )
}

export function CreateVaultWizard(): React.JSX.Element | null {
  const flow = useWizard((s) => s.flow)
  const phase = useWizard((s) => s.phase)
  const steps = useWizard((s) => s.steps)
  const dir = useWizard((s) => s.dir)
  const failure = useWizard((s) => s.failure)
  const result = useWizard((s) => s.result)
  const pivoting = useWizard((s) => s.pivoting)
  const close = useWizard((s) => s.close)
  const runCreate = useWizard((s) => s.runCreate)
  const backToForm = useWizard((s) => s.backToForm)
  const openVault = useWizard((s) => s.openVault)
  const identityReady = useIdentity((s) => s.profile !== null)
  if (flow !== 'create') return null

  const formReason = !dir
    ? 'Choose a folder for the new vault.'
    : !identityReady
      ? 'Set your identity in Settings first.'
      : null
  const submit =
    phase === 'form'
      ? {
          label: 'Create vault',
          disabled: !dir || !identityReady,
          reason: formReason,
          act: () => void runCreate(),
        }
      : phase === 'running'
        ? { label: 'Creating…', disabled: true, act: () => {} }
        : phase === 'done'
          ? {
              label: pivoting ? 'Opening…' : 'Open vault',
              disabled: pivoting,
              act: () => void openVault(result?.vaultPath ?? dir ?? ''),
            }
          : failure?.recovery === 'open-local'
            ? {
                label: pivoting ? 'Opening…' : 'Open local vault',
                disabled: pivoting || !dir,
                act: () => void openVault(dir ?? ''),
              }
            : { label: 'Edit and retry', disabled: false, act: backToForm }

  return (
    <Modal
      title="Create a vault"
      onClose={close}
      onSubmit={submit.act}
      submitLabel={submit.label}
      submitDisabled={submit.disabled}
      submitBlockedReason={'reason' in submit ? submit.reason : null}
    >
      {phase === 'form' ? (
        <CreateForm />
      ) : (
        <>
          <WizardSteps steps={steps} />
          {phase === 'failed' && <FailurePanel />}
          {phase === 'done' && (
            <p className="wizard-check-ok">
              Vault created{result?.vaultPath ? ` at ${result.vaultPath}` : ''} — open it to start
              reading and routing.
            </p>
          )}
        </>
      )}
    </Modal>
  )
}
