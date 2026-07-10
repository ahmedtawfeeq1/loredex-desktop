/**
 * Changed-since panel (story 10.7): the overlay toggle, the since-picker
 * (date, or "since my last visit"), and per-project changed counts. Turning
 * the overlay off restores the plain canvas.
 */
import { useMemo } from 'react'
import { atlasLastVisit, useAtlas } from '../../stores/atlas'
import { clusterChangedCounts } from './changed-since'

export function ChangedSinceToggle(): React.JSX.Element {
  const overlayOn = useAtlas((s) => s.overlayOn)
  const overlaySince = useAtlas((s) => s.overlaySince)
  const overlayChanged = useAtlas((s) => s.overlayChanged)
  const toggleOverlay = useAtlas((s) => s.toggleOverlay)
  const setOverlaySince = useAtlas((s) => s.setOverlaySince)
  const setPanel = useAtlas((s) => s.setPanel)
  const lastVisit = atlasLastVisit()

  const counts = useMemo(() => clusterChangedCounts(overlayChanged), [overlayChanged])

  return (
    <aside className="atlas-side" aria-label="Changed since">
      <div className="atlas-side-head">
        <span className="atlas-side-title">Changed since</span>
        <button type="button" className="atlas-side-close" onClick={() => setPanel(null)} aria-label="Close panel">
          ×
        </button>
      </div>
      {/* DESIGN toggle row: label left, switch right — gold when on */}
      <div className="atlas-overlay-row">
        <span>Show changes</span>
        <button
          type="button"
          role="switch"
          aria-checked={overlayOn}
          aria-label="Changed-since overlay"
          className="atlas-overlay-switch"
          onClick={toggleOverlay}
        >
          <span className="atlas-overlay-knob" />
        </button>
      </div>
      <div className="atlas-filter-group">
        <span className="atlas-filter-title">Since</span>
        <input
          type="date"
          className="atlas-filter-select"
          aria-label="Since date"
          value={(overlaySince ?? '').slice(0, 10)}
          onChange={(e) => {
            if (e.target.value) setOverlaySince(e.target.value)
          }}
        />
        <button
          type="button"
          className="atlas-tool"
          disabled={!lastVisit}
          title={lastVisit ? `Last visit: ${lastVisit.slice(0, 16).replace('T', ' ')}` : 'No earlier visit recorded on this machine yet'}
          onClick={() => {
            if (lastVisit) setOverlaySince(lastVisit)
          }}
        >
          Since my last visit
        </button>
      </div>
      {overlayOn && (
        <div className="atlas-filter-group" aria-label="Changed counts per project">
          <span className="atlas-filter-title">Changed per project</span>
          {counts.size === 0 ? (
            <p className="atlas-side-empty">Nothing changed since then.</p>
          ) : (
            [...counts.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([project, n]) => (
                <div key={project} className="atlas-overlay-count">
                  <span>{project}</span>
                  <span className="atlas-overlay-count-badge">{n}</span>
                </div>
              ))
          )}
        </div>
      )}
    </aside>
  )
}
