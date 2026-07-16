/**
 * First-run screen (story 13.2 AC2): replaces the bare vault picker whenever
 * no vault is configured. Logo mark, one quiet sentence, three cards — Create
 * (13.1 wizard), Join (13.2 wizard), Open an existing folder (the old picker
 * path, kept). Renderer composition only; no new state.
 */
import { BrandMark } from '../../components/BrandMark'
import { useApp } from '../../stores/app'
import { useWizard } from '../../stores/wizard'

/** The R1 brand mark, first-run sized (brass ring mark retired — DESIGN v3). */
function Mark(): React.JSX.Element {
  return <BrandMark size={96} className="firstrun-mark" />
}

/** v3 §6.6 first-run checklist (wireframe 1j): the three steps to a working
 *  dex, mono-numbered — plain copy, no state; the cards below ARE the doors. */
const CHECKLIST: ReadonlyArray<{ step: string; text: string }> = [
  { step: '01', text: 'Create or join a dex — one per product' },
  { step: '02', text: 'Set your identity (Settings › Personal) so writes are attributed' },
  { step: '03', text: 'Point your agents at the MCP host — notes start filing themselves' },
]

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
          <span className="firstrun-card-title">Create a dex</span>
          <span className="firstrun-card-body">
            Start fresh — scaffold a dex here and optionally wire a remote your team can join.
          </span>
        </button>
        <button type="button" className="firstrun-card" onClick={() => openJoin()}>
          <span className="firstrun-card-title">Join a dex</span>
          <span className="firstrun-card-body">
            Paste your team’s repository URL — cloned and registered in minutes, zero git commands.
          </span>
        </button>
        <button type="button" className="firstrun-card" onClick={() => void openVaultPicker()}>
          <span className="firstrun-card-title">Open an existing folder</span>
          <span className="firstrun-card-body">Point at a loredex dex already on this machine.</span>
        </button>
      </div>
      <div className="firstrun-checklist" aria-label="Getting started">
        {CHECKLIST.map(({ step, text }) => (
          <div className="firstrun-check" key={step}>
            <span className="ro-num">{step}</span>
            <span className="firstrun-check-text">{text}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
