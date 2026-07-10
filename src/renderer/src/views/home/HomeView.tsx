/**
 * Product home (story 2.5): the Start Here brief rendered through the one
 * sanctioned pipeline — wikilinks resolve, commit SHAs link to the remote —
 * with a freshness badge. v0.1 scope cut: no async re-curate button (real
 * curation needs the claude CLI); Refresh re-reads the brief from disk.
 */
import { useEffect } from 'react'
import { useApp } from '../../stores/app'
import { useHome } from '../../stores/home'
import { githubWebBase } from '../../../../shared/github'
import { renderMarkdown } from '../../markdown/pipeline'
import { DEFAULT_BRIEF_TITLE, splitLeadingH1 } from './brief-title'
import { formatFreshness } from './freshness'

export function HomeView(): React.JSX.Element {
  const brief = useHome((s) => s.brief)
  const loading = useHome((s) => s.loading)
  const error = useHome((s) => s.error)
  const load = useHome((s) => s.load)
  const remote = useApp((s) => s.identity?.remote ?? null)

  useEffect(() => {
    if (!brief) void load()
  }, [brief, load])

  const freshness = brief ? formatFreshness(brief.mtime) : null
  // defect 14.2-1: one title owner — the chrome lifts the brief's own H1
  const split = brief ? splitLeadingH1(brief.markdown) : null

  return (
    <div className="home">
      <div className="board-header">
        <span className="pane-list-title">Start Here</span>
        {freshness && (
          <span className={`freshness freshness-${freshness.tone}`}>{freshness.label}</span>
        )}
        <button
          type="button"
          className="button-quiet"
          title="Re-read the brief from disk"
          onClick={() => void load()}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="note-error">{error}</div>}
      {brief === null ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Reading the product brief…</p>
        </div>
      ) : (
        <article className="note">
          <h1 className="note-title">{split?.title ?? DEFAULT_BRIEF_TITLE}</h1>
          {brief.generated && (
            <p className="home-generated-hint">
              No curated brief in this vault yet — this is a live snapshot of the current project
              states. Run <span className="mono">loredex product</span> to curate one.
            </p>
          )}
          <div className="note-body">
            {/* story 12.1: SHAs link through the one GitHub derivation */}
            {renderMarkdown(split?.body ?? brief.markdown, githubWebBase(remote))}
          </div>
        </article>
      )}
    </div>
  )
}
