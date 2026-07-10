/**
 * Handoff inbox/outbox board (story 3.2, the F1 killer's visible half).
 * Two lanes per project; project switcher with a company-wide (PM) view.
 * Card click opens the brief in the reader with reading order inline.
 */
import { useEffect } from 'react'
import { isValidIdentity } from '../../../../shared/identity'
import type { HandoffCard } from '../../../../shared/types'
import { onEvent } from '../../api'
import { ConsumeReceiptView } from '../../components/ConsumeReceiptView'
import { HandoffCardView } from '../../components/HandoffCardView'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
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

/** The consume affordance on an open inbound card (story 3.4). */
function ConsumeAction({ card }: { card: HandoffCard }): React.JSX.Element {
  const consume = useHandoffs((s) => s.consume)
  const consumingId = useHandoffs((s) => s.consumingId)
  const hasIdentity = useIdentity((s) => effectiveIdentity(s) !== null)
  return (
    <button
      type="button"
      className="consume-button"
      disabled={!hasIdentity || consumingId !== null}
      title={hasIdentity ? 'Consume this handoff (⌘⏎)' : 'Set your identity in Settings first'}
      onClick={(e) => {
        e.stopPropagation()
        void consume(card)
      }}
    >
      consume ⌘⏎
    </button>
  )
}

function Lane({
  title,
  cards,
  empty,
  inbound,
}: {
  title: string
  cards: HandoffCard[]
  empty: string
  inbound?: boolean
}): React.JSX.Element {
  const consume = useHandoffs((s) => s.consume)
  const pressedId = useHandoffs((s) => s.pressedId)
  const openCompose = useHandoffs((s) => s.openCompose)
  const openAnnotate = useHandoffs((s) => s.openAnnotate)
  return (
    <section className="board-lane" aria-label={title}>
      <h2 className="board-lane-title">{title}</h2>
      {cards.length === 0 ? (
        <p className="board-lane-empty">{empty}</p>
      ) : (
        cards.map((card) => (
          <HandoffCardView
            key={card.id}
            card={card}
            onOpen={openBrief}
            pressed={pressedId === card.id}
            onReply={(c) => openCompose(c)}
            onComment={(c) => openAnnotate(c)}
            {...(inbound && card.status === 'open'
              ? {
                  onConsume: (c: HandoffCard) => void consume(c),
                  consumeSlot: <ConsumeAction card={card} />,
                }
              : {})}
          />
        ))
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
        inbound
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
  const receipt = useHandoffs((s) => s.receipt)
  const load = useHandoffs((s) => s.load)
  const setProject = useHandoffs((s) => s.setProject)
  const dismissReceipt = useHandoffs((s) => s.dismissReceipt)
  const identityLoaded = useIdentity((s) => s.loaded)
  const loadIdentity = useIdentity((s) => s.load)

  useEffect(() => {
    if (!identityLoaded) void loadIdentity()
  }, [identityLoaded, loadIdentity])

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
        <button
          type="button"
          className="button-primary"
          title="Compose a handoff (story 7.2)"
          onClick={() => useHandoffs.getState().openCompose()}
        >
          New handoff
        </button>
      </div>
      {error && <div className="note-error">{error}</div>}
      {receipt && <ConsumeReceiptView receipt={receipt} onDismiss={dismissReceipt} />}
      {cards === null ? (
        <Skeleton />
      ) : cards.length === 0 ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>No handoffs in this vault yet.</p>
          {/* secondary — the view's one gold primary is New handoff above */}
          <button type="button" className="button-secondary" onClick={() => void load()}>
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
