/**
 * Handoff inbox/outbox board (story 3.2, the F1 killer's visible half).
 * Two lanes per project; project switcher with a company-wide (PM) view.
 * Card click opens the brief in the reader with reading order inline.
 */
import { useEffect } from 'react'
import { isValidIdentity } from '../../../../shared/identity'
import type { HandoffCard } from '../../../../shared/types'
import { ConsumeReceiptView } from '../../components/ConsumeReceiptView'
import { HandoffCardView } from '../../components/HandoffCardView'
import { ContractChips } from '../contracts/ContractChips'
import { useApp } from '../../stores/app'
import { useHandoffs } from '../../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useReader } from '../../stores/reader'
import {
  actionsFor,
  filterByDisplay,
  fulfilledByMap,
  groupByProject,
  hiddenCount,
  type Lanes,
  lanesFor,
  projectsOf,
  toVaultRelative,
} from '../../../../shared/handoff-lanes'
import { useBoardFilter } from '../../stores/boardFilter'

/** Open a handoff brief in the reader with its reading order rendered inline (F5). */
export function openBrief(card: HandoffCard): void {
  const vaultPath = useApp.getState().identity?.vaultPath ?? ''
  useApp.getState().setView('reader')
  useHandoffs.getState().markRead(card) // story 9.2: opening marks read
  void useReader.getState().open(toVaultRelative(card.path, vaultPath), card.readingOrder)
}

/**
 * State-legal recipient actions on an inbound card (story 8.1 AC1):
 * open → Accept (gold) / Decline / Snooze; accepted → Consume;
 * declined/snoozed → Reopen; consumed → none. Legality stays lib-enforced.
 */
function LifecycleActions({ card }: { card: HandoffCard }): React.JSX.Element | null {
  const consume = useHandoffs((s) => s.consume)
  const setStatus = useHandoffs((s) => s.setStatus)
  const openDecline = useHandoffs((s) => s.openDecline)
  const openSnooze = useHandoffs((s) => s.openSnooze)
  const busy = useHandoffs((s) => s.consumingId !== null || s.transitioningId !== null)
  const hasIdentity = useIdentity((s) => effectiveIdentity(s) !== null)
  const actions = actionsFor(card, true)
  if (actions.length === 0) return null
  const disabled = !hasIdentity || busy
  const idleTitle = hasIdentity ? undefined : 'Set your identity in Settings first'
  const stop =
    (fn: () => void) =>
    (e: React.MouseEvent): void => {
      e.stopPropagation()
      fn()
    }
  return (
    <span className="handoff-actions">
      {actions.includes('accept') && (
        <button
          type="button"
          className="button-primary button-small"
          disabled={disabled}
          title={idleTitle ?? 'Accept — you will take this up'}
          onClick={stop(() => void setStatus(card, { to: 'accepted' }))}
        >
          Accept
        </button>
      )}
      {actions.includes('decline') && (
        <button
          type="button"
          className="button-destructive button-small"
          disabled={disabled}
          title={idleTitle ?? 'Decline with a reason (reversible)'}
          onClick={stop(() => openDecline(card))}
        >
          Decline
        </button>
      )}
      {actions.includes('snooze') && (
        <button
          type="button"
          className="button-secondary button-small"
          disabled={disabled}
          title={idleTitle ?? 'Snooze until a date'}
          onClick={stop(() => openSnooze(card))}
        >
          Snooze
        </button>
      )}
      {actions.includes('consume') && (
        <button
          type="button"
          className="consume-button"
          disabled={disabled}
          title={idleTitle ?? 'Consume this handoff (⌘⏎)'}
          onClick={stop(() => void consume(card))}
        >
          consume ⌘⏎
        </button>
      )}
      {actions.includes('reopen') && (
        <button
          type="button"
          className="button-secondary button-small"
          disabled={disabled}
          title={idleTitle ?? 'Reopen — back to the open lane'}
          onClick={stop(() => void setStatus(card, { to: 'open' }))}
        >
          Reopen
        </button>
      )}
    </span>
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
  const openLinkRequest = useHandoffs((s) => s.openLinkRequest)
  const readAt = useHandoffs((s) => s.readAt)
  // story 8.3 AC3: derived reverse fulfills edges — recomputed per render
  const fulfilled = fulfilledByMap(useHandoffs((s) => s.cards) ?? [])
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
            unread={readAt[card.id] === null}
            // story 11.3 AC3: derived contract chips — recomputed on board load
            chipsSlot={<ContractChips handoffId={card.id} />}
            {...(fulfilled.has(card.id) ? { fulfilledBy: fulfilled.get(card.id) } : {})}
            {...(!inbound && card.kind === 'delivery' && !card.fulfills
              ? { onLinkRequest: (c: HandoffCard) => openLinkRequest(c) }
              : {})}
            {...(inbound && actionsFor(card, true).length > 0
              ? {
                  actionsSlot: <LifecycleActions card={card} />,
                  // ⌘⏎ keeps meaning consume; the store gates legality (open|accepted)
                  onConsume: (c: HandoffCard) => void consume(c),
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
    // live refresh moved to the store's module-level subscription (story 9.3)
    // so the board stays fresh from every view; this effect only primes it
    if (cards === null) void load()
  }, [cards, load])

  const filterMode = useBoardFilter((s) => s.mode)
  const setFilterMode = useBoardFilter((s) => s.set)
  const allCards = cards ?? []
  const projects = projectsOf(allCards)
  // D1 amendment 6: the board opens as a work surface — done handoffs hidden
  // by default. The filter is display-only; nav badge / KPI counts are unchanged.
  const shown = filterByDisplay(allCards, filterMode)
  const hidden = hiddenCount(allCards, filterMode)

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
        {/* D1 amendment 6: Active (default) hides consumed/declined; the board
            opens ready for new work. Display-only — counts never change. */}
        <div className="seg-control board-filter" role="group" aria-label="Show">
          {(['active', 'done', 'all'] as const).map((m) => (
            <button
              key={m}
              type="button"
              className={`seg-option${filterMode === m ? ' seg-active' : ''}`}
              aria-pressed={filterMode === m}
              onClick={() => setFilterMode(m)}
            >
              {m === 'active' ? 'Active' : m === 'done' ? 'Done' : 'All'}
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
      {hidden > 0 && (
        <button
          type="button"
          className="board-hidden-hint"
          onClick={() => setFilterMode('all')}
          title="Show done handoffs too"
        >
          {hidden} done hidden — show all
        </button>
      )}
      {cards === null ? (
        <Skeleton />
      ) : allCards.length === 0 ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>No handoffs in this vault yet.</p>
          {/* secondary — the view's one gold primary is New handoff above */}
          <button type="button" className="button-secondary" onClick={() => void load()}>
            Check again
          </button>
        </div>
      ) : shown.length === 0 ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>
            {filterMode === 'active'
              ? "No active handoffs — you're all caught up."
              : 'Nothing here in this view.'}
          </p>
          {hidden > 0 && (
            <button type="button" className="button-secondary" onClick={() => setFilterMode('all')}>
              Show done ({hidden})
            </button>
          )}
        </div>
      ) : project === 'all' ? (
        <div className="board-groups">
          {groupByProject(shown).map(({ project: p, lanes }) => (
            <details key={p} open className="board-group">
              <summary className="board-group-title">{p}</summary>
              <ProjectLanes project={p} lanes={lanes} />
            </details>
          ))}
        </div>
      ) : (
        <ProjectLanes project={project} lanes={lanesFor(shown, project)} />
      )}
    </div>
  )
}
