/**
 * First-run screen (story 13.2 AC2): replaces the bare vault picker whenever
 * no vault is configured. Logo mark, one serif sentence, three cards — Create
 * (13.1 wizard), Join (13.2 wizard), Open an existing folder (the old picker
 * path, kept). Renderer composition only; no new state.
 */
import { useApp } from '../../stores/app'
import { useWizard } from '../../stores/wizard'

/** Inline loredex mark (build/icon.svg identity: gold dex ring, paper card). */
function Mark(): React.JSX.Element {
  return (
    <svg className="firstrun-mark" viewBox="0 0 96 96" aria-hidden="true">
      <circle cx="48" cy="48" r="34" fill="none" stroke="var(--gold)" strokeWidth="5" />
      <g transform="rotate(5 52 52)">
        <path
          d="M 34 28 H 56 L 66 38 V 66 a 4 4 0 0 1 -4 4 H 38 a 4 4 0 0 1 -4 -4 Z"
          fill="var(--bg-card)"
          stroke="var(--hairline)"
        />
        <rect x="40" y="44" width="18" height="3" rx="1.5" fill="var(--text-2)" />
        <rect x="40" y="51" width="22" height="3" rx="1.5" fill="var(--text-2)" />
        <rect x="40" y="58" width="14" height="3" rx="1.5" fill="var(--text-2)" />
      </g>
    </svg>
  )
}

export function FirstRun(): React.JSX.Element {
  const openVaultPicker = useApp((s) => s.openVaultPicker)
  const openCreate = useWizard((s) => s.openCreate)
  const openJoin = useWizard((s) => s.openJoin)
  return (
    <div className="firstrun">
      <Mark />
      <h1 className="firstrun-title">Loredex</h1>
      <p className="firstrun-line">Your team’s knowledge, filed where the next person looks.</p>
      <div className="firstrun-cards">
        <button type="button" className="firstrun-card" onClick={openCreate}>
          <span className="firstrun-card-title">Create a vault</span>
          <span className="firstrun-card-body">
            Start fresh — scaffold a vault here and optionally wire a remote your team can join.
          </span>
        </button>
        <button type="button" className="firstrun-card" onClick={() => openJoin()}>
          <span className="firstrun-card-title">Join a vault</span>
          <span className="firstrun-card-body">
            Paste your team’s repository URL — cloned and registered in minutes, zero git commands.
          </span>
        </button>
        <button type="button" className="firstrun-card" onClick={() => void openVaultPicker()}>
          <span className="firstrun-card-title">Open an existing folder</span>
          <span className="firstrun-card-body">
            Point at a loredex vault already on this machine.
          </span>
        </button>
      </div>
    </div>
  )
}
