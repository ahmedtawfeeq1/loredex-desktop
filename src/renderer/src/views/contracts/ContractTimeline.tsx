/**
 * Contracts view (story 11.2): the change timeline per the DESIGN v2 spec —
 * vertical rail, mono dates, one card per change (file mono, +/- counts in
 * --ok/rust, hash mono, author), project filter, click-through unified diff.
 * Live via contract.changed; Refresh is the fallback.
 */
import { useEffect } from 'react'
import type { ContractChange, ContractLink } from '../../../../shared/types'
import { useApp } from '../../stores/app'
import { useContracts } from '../../stores/contracts'
import { DiffView } from './DiffView'
import { filterByProject, projectsOf, railDate, timelineEmptyState } from './diff-logic'

/**
 * Linked-handoff chip slot (AC5): renders nothing until story 11.3 supplies
 * `links`. Tier styling is decided: mentioned = solid chip, heuristic = an
 * explicit --text-2 label — the app never pretends to know more than it does.
 */
function LinkChips({ links }: { links: ContractLink[] }): React.JSX.Element | null {
  if (links.length === 0) return null
  return (
    <span className="contract-links">
      {links.map((link) => (
        <span
          key={`${link.handoffId}:${link.confidence}`}
          className={`contract-link-chip chip-${link.confidence}`}
          title={
            link.confidence === 'mentioned'
              ? 'This commit is named in the handoff'
              : 'Heuristic: same project, same day — could be unrelated'
          }
        >
          {link.handoffId}
          {link.confidence === 'heuristic' && <em className="chip-tier">heuristic</em>}
        </span>
      ))}
    </span>
  )
}

function ChangeCard({ change }: { change: ContractChange }): React.JSX.Element {
  const openDiff = useContracts((s) => s.openDiff)
  const diffFor = useContracts((s) => s.diffFor)
  const toggleDiff = useContracts((s) => s.toggleDiff)
  const open = openDiff !== null && openDiff.sha === change.sha && openDiff.file === change.file
  return (
    <li className="timeline-entry">
      <span className="timeline-date">{railDate(change.date)}</span>
      <div className="timeline-body">
        <button
          type="button"
          className="contract-card"
          aria-expanded={open}
          title={open ? 'Hide the diff' : 'Show what changed in this commit'}
          onClick={() => void toggleDiff(change)}
        >
          <span className="contract-card-top">
            <span className="mono contract-file">{change.file}</span>
            <span className="contract-counts">
              {change.adds !== null && <span className="contract-adds">+{change.adds}</span>}
              {change.dels !== null && <span className="contract-dels">−{change.dels}</span>}
              {change.adds === null && change.dels === null && (
                <span className="contract-binary">binary</span>
              )}
            </span>
          </span>
          <span className="contract-subject">{change.subject}</span>
          <span className="contract-meta">
            <span className="mono">{change.sha.slice(0, 7)}</span> · {change.author} ·{' '}
            {change.project}
            <LinkChips links={change.links} />
          </span>
        </button>
        {diffFor === change.sha && <p className="settings-hint">Reading the diff…</p>}
        {open && openDiff && <DiffView diff={openDiff} />}
      </div>
    </li>
  )
}

export function ContractTimeline(): React.JSX.Element {
  const changes = useContracts((s) => s.changes)
  const rootsCount = useContracts((s) => s.rootsCount)
  const loading = useContracts((s) => s.loading)
  const error = useContracts((s) => s.error)
  const diffError = useContracts((s) => s.diffError)
  const project = useContracts((s) => s.project)
  const load = useContracts((s) => s.load)
  const setProject = useContracts((s) => s.setProject)
  const setView = useApp((s) => s.setView)

  useEffect(() => {
    if (changes === null) void load()
  }, [changes, load])

  const projects = projectsOf(changes ?? [])
  const visible = filterByProject(changes ?? [], project)
  const empty = changes === null ? null : timelineEmptyState(rootsCount ?? 0, changes.length)

  return (
    <div className="contracts">
      <div className="board-header">
        <span className="pane-list-title">Contracts</span>
        {projects.length > 0 && (
          <div className="board-switcher" role="tablist" aria-label="Project">
            <button
              type="button"
              className="board-tab"
              role="tab"
              aria-selected={project === 'all'}
              onClick={() => setProject('all')}
            >
              All projects
            </button>
            {projects.map((p) => (
              <button
                key={p}
                type="button"
                className="board-tab"
                role="tab"
                aria-selected={project === p}
                onClick={() => setProject(p)}
              >
                {p}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          className="button-quiet"
          title="Rescan the registered repos (live updates arrive on their own)"
          onClick={() => void load()}
        >
          {loading ? 'Scanning…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="note-error">{error}</div>}
      {diffError && <div className="note-error">{diffError}</div>}
      {changes === null ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Reading contract history…</p>
        </div>
      ) : empty === 'no-roots' ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Point the app at your team’s repos to see contract changes here.</p>
          <button type="button" className="button-primary" onClick={() => setView('settings')}>
            Choose project folders…
          </button>
        </div>
      ) : empty === 'no-matches' ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>No contract files found in the registered project folders.</p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>No contract changes in {project === 'all' ? 'any project' : project} yet.</p>
        </div>
      ) : (
        <ul className="timeline-rail">
          {visible.map((change) => (
            <ChangeCard key={`${change.repoRoot}/${change.file}@${change.sha}`} change={change} />
          ))}
        </ul>
      )}
    </div>
  )
}
