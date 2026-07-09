/**
 * Handoff inbox/outbox board (story 3.2, the F1 killer's visible half).
 * Two lanes per project; project switcher with a company-wide (PM) view.
 * Card click opens the brief in the reader with reading order inline.
 */
import { useEffect } from 'react'
import type { HandoffCard } from '../../../../shared/types'
import { onEvent } from '../../api'
import { HandoffCardView } from '../../components/HandoffCardView'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import {
  groupByProject,
  type Lanes,
  lanesFor,
  projectsOf,
  toVaultRelative,
} from '../../../../shared/handoff-lanes'

/** Open a handoff brief in the reader with its reading order rendered inline (F5). */
export function openBrief(card: HandoffCard): void {
  const vaultPath = useApp.getState().identity?.vaultPath ?? ''
  useApp.getState().setView('reader')
  void useReader.getState().open(toVaultRelative(card.path, vaultPath), card.readingOrder)
}

function Lane({
  title,
  cards,
  empty,
}: {
  title: string
  cards: HandoffCard[]
  empty: string
}): React.JSX.Element {
  return (
    <section className="board-lane" aria-label={title}>
      <h2 className="board-lane-title">{title}</h2>
      {cards.length === 0 ? (
        <p className="board-lane-empty">{empty}</p>
      ) : (
        cards.map((card) => <HandoffCardView key={card.id} card={card} onOpen={openBrief} />)
      )}
    </section>
  )
}

function ProjectLanes({ project, lanes }: { project: string; lanes: Lanes }): React.JSX.Element {
  return (
    <div className="board-lanes">
      <Lane
        title={`Inbox — to ${project}`}
        cards={lanes.inbound}
        empty="No open handoffs for this vault."
      />
      <Lane
        title={`Outbox — from ${project}`}
        cards={lanes.outbound}
        empty="Nothing sent from here yet."
      />
    </div>
  )
}

function Skeleton(): React.JSX.Element {
  return (
    <div className="board-lanes" aria-hidden>
      <div className="board-lane">
        <div className="handoff-card skeleton" />
        <div className="handoff-card skeleton" />
      </div>
      <div className="board-lane">
        <div className="handoff-card skeleton" />
      </div>
    </div>
  )
}

export function Board(): React.JSX.Element {
  const cards = useHandoffs((s) => s.cards)
  const error = useHandoffs((s) => s.error)
  const project = useHandoffs((s) => s.project)
  const load = useHandoffs((s) => s.load)
  const setProject = useHandoffs((s) => s.setProject)

  useEffect(() => {
    if (cards === null) void load()
    // board refreshes on vault changes and handoff events (AC4)
    return onEvent((e) => {
      if (
        e.kind === 'vault.changed' ||
        e.kind === 'handoff.new' ||
        e.kind === 'handoff.stateChanged'
      ) {
        void load()
      }
    })
  }, [cards, load])

  const projects = projectsOf(cards ?? [])

  return (
    <div className="board">
      <div className="board-header">
        <span className="pane-list-title">Handoffs</span>
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
        <button
          type="button"
          className="button-quiet"
          title="Re-read handoffs from disk"
          onClick={() => void load()}
        >
          Refresh
        </button>
      </div>
      {error && <div className="note-error">{error}</div>}
      {cards === null ? (
        <Skeleton />
      ) : cards.length === 0 ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>No handoffs in this vault yet.</p>
          <button type="button" className="button-primary" onClick={() => void load()}>
            Check again
          </button>
        </div>
      ) : project === 'all' ? (
        <div className="board-groups">
          {groupByProject(cards).map(({ project: p, lanes }) => (
            <details key={p} open className="board-group">
              <summary className="board-group-title">{p}</summary>
              <ProjectLanes project={p} lanes={lanes} />
            </details>
          ))}
        </div>
      ) : (
        <ProjectLanes project={project} lanes={lanesFor(cards, project)} />
      )}
    </div>
  )
}
