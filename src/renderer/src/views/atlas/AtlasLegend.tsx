/**
 * "How to read this map" legend popover (story epic17.2, D1 amendment 3). A
 * compact card the `?` button opens (and the first-ever Atlas visit auto-opens
 * once). Content is the pure atlas-legend model; this is only the chrome.
 */
import { useEffect } from 'react'
import { useAtlas } from '../../stores/atlas'
import { LEGEND_FIRST_ACTION, LEGEND_SECTIONS } from './atlas-legend'

export function AtlasLegend(): React.JSX.Element {
  const closeLegend = useAtlas((s) => s.closeLegend)

  useEffect(() => {
    function onKey(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        e.preventDefault()
        closeLegend()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [closeLegend])

  return (
    // biome-ignore lint: click-scrim dismiss is a convenience; Esc + the × are the real paths
    <div className="atlas-legend-scrim" onClick={closeLegend}>
      {/* biome-ignore lint: stops the scrim dismiss; focusable content lives inside */}
      <div
        className="atlas-legend"
        role="dialog"
        aria-label="How to read this map"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="atlas-legend-head">
          <span className="atlas-legend-title">How to read this map</span>
          <button
            type="button"
            className="atlas-side-close"
            title="Close"
            aria-label="Close"
            onClick={closeLegend}
          >
            ×
          </button>
        </div>
        <div className="atlas-legend-body">
          {LEGEND_SECTIONS.map((section) => (
            <section key={section.title} className="atlas-legend-section">
              <h4 className="atlas-legend-section-title">{section.title}</h4>
              <dl className="atlas-legend-rows">
                {section.rows.map((row) => (
                  <div key={row.term} className="atlas-legend-row">
                    <dt className="atlas-legend-term">{row.term}</dt>
                    <dd className="atlas-legend-meaning">{row.meaning}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>
        <p className="atlas-legend-first-action">{LEGEND_FIRST_ACTION}</p>
      </div>
    </div>
  )
}
