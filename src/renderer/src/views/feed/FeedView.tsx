/**
 * Activity feed (story 6.2; D1 "Activity cards" redesign, story 16.6): the
 * vault git log as cards under day headers — kind chips, actor + relative
 * time, middle-truncated mono paths, sha chips, status-churn collapse and
 * per-kind outline-pill actions.
 */
import { useEffect, useMemo, useState } from 'react'
import { githubWebBase } from '../../../../shared/github'
import { toVaultRelative } from '../../../../shared/handoff-lanes'
import type { ActivityEvent } from '../../../../shared/types'
import { CommitChip } from '../../components/CommitChip'
import { useApp } from '../../stores/app'
import { useContracts } from '../../stores/contracts'
import { useFeed } from '../../stores/feed'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { openContractChange } from '../contracts/ContractChips'
import { reverseContractLinks } from '../contracts/contract-links'
import {
  collapseChurn,
  dayLabel,
  type FeedAction,
  type FeedActionCtx,
  type FeedItem,
  feedActions,
  flipLabel,
  groupItemsByDay,
  middleTruncate,
  relativeTime,
  summaryQuotesObjective,
  targetOf,
} from './feed-logic'

/** Card-click navigation (kept from 6.2): board / reader / sync panel. */
function open(event: ActivityEvent): void {
  const target = targetOf(event)
  const app = useApp.getState()
  if (target.kind === 'note') {
    app.setView('reader')
    const vaultPath = app.identity?.vaultPath ?? ''
    void useReader.getState().open(toVaultRelative(target.path, vaultPath))
  } else if (target.kind === 'board') {
    app.setView('handoffs')
  } else {
    app.setView('sync')
  }
}

/** D1 action wiring (AC5): each pill lands on an existing store/route. */
function performFeedAction(action: FeedAction): void {
  const app = useApp.getState()
  switch (action.id) {
    case 'open-note': {
      app.setView('reader')
      const vaultPath = app.identity?.vaultPath ?? ''
      void useReader.getState().open(toVaultRelative(action.path, vaultPath))
      return
    }
    case 'view-card': {
      app.setView('handoffs')
      return
    }
    case 'consume': {
      const card = (useHandoffs.getState().cards ?? []).find((c) => c.id === action.handoffId)
      if (card) void useHandoffs.getState().consume(card)
      return
    }
    case 'open-sync': {
      app.setView('sync')
      return
    }
    case 'view-diff': {
      openContractChange(action.sha)
      return
    }
  }
}

function ActionPills({ actions }: { actions: FeedAction[] }): React.JSX.Element | null {
  if (actions.length === 0) return null
  return (
    <span className="feed-actions">
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="feed-action"
          onClick={(e) => {
            e.stopPropagation()
            performFeedAction(action)
          }}
        >
          {action.label}
        </button>
      ))}
    </span>
  )
}

/** Shared card head: kind chip · actor · relative time (absolute on hover). */
function CardHead({
  kind,
  actor,
  at,
  now,
}: {
  kind: string
  actor: string
  at: string
  now: number
}): React.JSX.Element {
  return (
    <span className="feed-card-head">
      <span className={`feed-kind feed-kind-${kind}`}>{kind}</span>
      <span className="feed-actor">{actor}</span>
      <span className="feed-time" title={at}>
        {relativeTime(at, now)}
      </span>
    </span>
  )
}

function cardKeyHandler(activate: () => void) {
  return (e: React.KeyboardEvent): void => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      activate()
    }
  }
}

function EventCard({
  event,
  commitBase,
  now,
  actions,
}: {
  event: ActivityEvent
  /** vault repo's GitHub base (story 12.1) — activity SHAs are vault commits */
  commitBase: string | null
  now: number
  actions: FeedAction[]
}): React.JSX.Element {
  const path = event.subject.path
  return (
    // div role=button (story 12.1): chip anchors/pills may not nest in <button>
    <div
      role="button"
      tabIndex={0}
      className="feed-card"
      onClick={() => open(event)}
      onKeyDown={cardKeyHandler(() => open(event))}
    >
      <CardHead kind={event.kind} actor={event.actor.name} at={event.at} now={now} />
      <span
        className={
          summaryQuotesObjective(event.summary) ? 'feed-summary feed-summary-objective' : 'feed-summary'
        }
      >
        {event.summary}
      </span>
      {path && (
        <span className="feed-path" title={path}>
          {middleTruncate(path)}
        </span>
      )}
      <span className="feed-card-foot">
        <CommitChip sha={event.sha} base={commitBase} />
        <ActionPills actions={actions} />
      </span>
    </div>
  )
}

/** D1: ≥2 consecutive same-actor flips inside 10 min — one expandable card. */
function ChurnCard({
  item,
  commitBase,
  now,
  actions,
}: {
  item: Extract<FeedItem, { type: 'churn' }>
  commitBase: string | null
  now: number
  actions: FeedAction[]
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const newest = item.events[0] as ActivityEvent
  const path = newest.subject.path
  return (
    <div
      role="button"
      tabIndex={0}
      className="feed-card"
      onClick={() => open(newest)}
      onKeyDown={cardKeyHandler(() => open(newest))}
    >
      <CardHead kind="status" actor={item.actor.name} at={newest.at} now={now} />
      <span className="feed-summary">
        status churn ×{item.events.length} on {item.handoffId}
      </span>
      {path && (
        <span className="feed-path" title={path}>
          {middleTruncate(path)}
        </span>
      )}
      <button
        type="button"
        className="button-quiet feed-churn-toggle"
        onClick={(e) => {
          e.stopPropagation()
          setExpanded((v) => !v)
        }}
      >
        {expanded ? 'Hide flips' : `Show ${item.events.length} flips`}
      </button>
      {expanded && (
        <span className="feed-flips">
          {item.events.map((flip) => (
            <span key={flip.sha} className="feed-flip">
              <span title={flip.at}>{flip.at.slice(11, 16)}</span>
              <span>{flipLabel(flip.summary)}</span>
              <CommitChip sha={flip.sha} base={commitBase} />
            </span>
          ))}
        </span>
      )}
      <span className="feed-card-foot">
        <CommitChip sha={newest.sha} base={commitBase} />
        <ActionPills actions={actions} />
      </span>
    </div>
  )
}

export function FeedView(): React.JSX.Element {
  const events = useFeed((s) => s.events)
  const loading = useFeed((s) => s.loading)
  const error = useFeed((s) => s.error)
  const load = useFeed((s) => s.load)
  const loadMore = useFeed((s) => s.loadMore)
  // story 12.1: vault-repo SHAs link through the one GitHub derivation
  const commitBase = githubWebBase(useApp((s) => s.identity?.remote ?? null))
  // consume gating (D1: "Consume when open inbound") reads the board cards
  const cards = useHandoffs((s) => s.cards)
  // contract-linked detection (story 11.3 inversion) reads the timeline
  const changes = useContracts((s) => s.changes)
  const contractsLoading = useContracts((s) => s.loading)

  useEffect(() => {
    if (events === null) void load()
  }, [events, load])
  useEffect(() => {
    if (cards === null) void useHandoffs.getState().load()
  }, [cards])
  useEffect(() => {
    // same prime as ContractChips (story 11.3 AC5) — core scan is cached
    if (changes === null && !contractsLoading) void useContracts.getState().load()
  }, [changes, contractsLoading])

  const linksByHandoff = useMemo(() => reverseContractLinks(changes ?? []), [changes])
  const items = useMemo(() => collapseChurn(events ?? []), [events])

  const ctxFor = (event: ActivityEvent): FeedActionCtx => {
    const handoffId = event.subject.handoffId
    const card = handoffId ? (cards ?? []).find((c) => c.id === handoffId) : undefined
    return {
      consumable: card?.status === 'open',
      diffSha: handoffId ? (linksByHandoff[handoffId]?.[0]?.sha ?? null) : null,
    }
  }

  const today = new Date().toISOString().slice(0, 10)
  const now = Date.now()

  return (
    <div className="feed">
      <div className="board-header">
        <span className="pane-list-title">Activity</span>
        <button
          type="button"
          className="button-quiet"
          title="Re-read the vault git log"
          onClick={() => void load()}
        >
          {loading ? 'Refreshing…' : 'Refresh'}
        </button>
      </div>
      {error && <div className="note-error">{error}</div>}
      {events === null ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Reading the vault history…</p>
        </div>
      ) : events.length === 0 ? (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>No activity in this vault yet.</p>
          <button type="button" className="button-primary" onClick={() => void load()}>
            Check again
          </button>
        </div>
      ) : (
        <div className="feed-list">
          {groupItemsByDay(items).map((group) => (
            <section key={group.day} aria-label={group.day}>
              <h2 className="feed-day">{dayLabel(group.day, today)}</h2>
              {group.items.map((item) => {
                // a churn card acts (and keys) as its newest flip
                const head = item.type === 'churn' ? (item.events[0] as ActivityEvent) : item.event
                const actions = feedActions(head, ctxFor(head))
                return item.type === 'churn' ? (
                  <ChurnCard
                    key={head.sha}
                    item={item}
                    commitBase={commitBase}
                    now={now}
                    actions={actions}
                  />
                ) : (
                  <EventCard
                    key={head.sha}
                    event={head}
                    commitBase={commitBase}
                    now={now}
                    actions={actions}
                  />
                )
              })}
            </section>
          ))}
          <button
            type="button"
            className="button-quiet feed-more"
            disabled={loading}
            onClick={() => void loadMore()}
          >
            Load older activity
          </button>
        </div>
      )}
    </div>
  )
}
