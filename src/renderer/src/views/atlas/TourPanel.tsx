/**
 * Tour panel (story 10.5): list the vault's tours (reading orders, threads,
 * topics), then drive playback — title, step description, step x/y, prev/next.
 * The Start button is the ONE gold primary of the Atlas view; step cards click
 * through to the §3 resolution of their first node.
 */
import { useEffect, useState } from 'react'
import type { TourDef } from '../../../../shared/types'
import { useAtlas } from '../../stores/atlas'
import { activateNode } from './resolve'

const KIND_LABEL: Record<TourDef['kind'], string> = {
  'reading-order': 'reading order',
  thread: 'thread',
  topic: 'topic',
}

export function TourPanel(): React.JSX.Element {
  const tours = useAtlas((s) => s.tours)
  const activeTour = useAtlas((s) => s.activeTour)
  const tourStep = useAtlas((s) => s.tourStep)
  const graph = useAtlas((s) => s.graph)
  const loadTours = useAtlas((s) => s.loadTours)
  const startTour = useAtlas((s) => s.startTour)
  const nextTourStep = useAtlas((s) => s.nextTourStep)
  const prevTourStep = useAtlas((s) => s.prevTourStep)
  const endTour = useAtlas((s) => s.endTour)
  const setPanel = useAtlas((s) => s.setPanel)
  const [picked, setPicked] = useState<string | null>(null)

  useEffect(() => {
    if (tours === null) void loadTours()
  }, [tours, loadTours])

  if (activeTour) {
    const step = activeTour.steps[tourStep]
    const stepNode = step && graph?.nodes.find((n) => n.id === step.nodeIds[0])
    return (
      <aside className="atlas-side" aria-label="Tour playback">
        <div className="atlas-side-head">
          <span className="atlas-side-title">{activeTour.title}</span>
          <button type="button" className="atlas-side-close" onClick={() => setPanel(null)} aria-label="Close panel">
            ×
          </button>
        </div>
        {activeTour.heuristic && <span className="atlas-tour-heuristic">heuristic order</span>}
        <div className="atlas-tour-progress" aria-live="polite">
          Step {tourStep + 1} / {activeTour.steps.length}
        </div>
        {step && (
          <button
            type="button"
            className="atlas-tour-step-card"
            title={stepNode ? 'Open this step' : 'Step not on this canvas yet'}
            onClick={() => {
              if (stepNode) void activateNode(stepNode)
            }}
          >
            <span className="atlas-tour-step-title">{step.title}</span>
            {step.description && <span className="atlas-tour-step-desc">{step.description}</span>}
          </button>
        )}
        <div className="atlas-tour-controls">
          <button
            type="button"
            className="button-secondary"
            disabled={tourStep <= 0}
            onClick={() => void prevTourStep()}
          >
            Previous
          </button>
          <button
            type="button"
            className="button-secondary"
            disabled={tourStep >= activeTour.steps.length - 1}
            onClick={() => void nextTourStep()}
          >
            Next
          </button>
        </div>
        <button type="button" className="atlas-tour-end" onClick={endTour}>
          End tour
        </button>
      </aside>
    )
  }

  const list = tours ?? []
  const pickedTour = list.find((t) => t.id === picked) ?? list[0]
  return (
    <aside className="atlas-side" aria-label="Tours">
      <div className="atlas-side-head">
        <span className="atlas-side-title">Tours</span>
        <button type="button" className="atlas-side-close" onClick={() => setPanel(null)} aria-label="Close panel">
          ×
        </button>
      </div>
      {tours === null ? (
        <p className="atlas-side-empty">Loading…</p>
      ) : list.length === 0 ? (
        <p className="atlas-side-empty">No tours yet — reading orders in handoffs become tours.</p>
      ) : (
        <>
          <div className="atlas-tour-list" role="radiogroup" aria-label="Available tours">
            {list.map((tour) => (
              <button
                key={tour.id}
                type="button"
                className="atlas-tour-row"
                role="radio"
                aria-checked={pickedTour?.id === tour.id}
                onClick={() => setPicked(tour.id)}
                onDoubleClick={() => void startTour(tour.id)}
              >
                <span className="atlas-tour-row-title">{tour.title}</span>
                <span className="atlas-tour-row-meta">
                  {KIND_LABEL[tour.kind]}
                  {tour.heuristic ? ' · heuristic' : ''} · {tour.steps.length} step
                  {tour.steps.length === 1 ? '' : 's'}
                </span>
              </button>
            ))}
          </div>
          <button
            type="button"
            className="button-primary"
            disabled={!pickedTour}
            onClick={() => {
              if (pickedTour) void startTour(pickedTour.id)
            }}
          >
            Start tour
          </button>
        </>
      )}
    </aside>
  )
}
