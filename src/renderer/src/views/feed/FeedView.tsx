/**
 * Activity (v3 parity slice H — reference 07): the vault git log as day-
 * grouped cards of rows — bordered caps kind chips (CONSUME/FILE green,
 * STATUS/SYNC slate, HANDOFF amber), rich sentences (bold actor + the
 * commit's own summary), mono time, blue action links. Every 6.2/D1
 * capability kept: kind + person filters (header segmented + everyone ▾),
 * status-churn collapse with expandable flips, per-kind actions, commit
 * chips, load-older. Rows navigate like the old cards did.
 */
import { useEffect, useMemo, useState } from 'react'
import { githubWebBase } from '../../../../shared/github'
import { toVaultRelative } from '../../../../shared/handoff-lanes'
import type { ActivityEvent } from '../../../../shared/types'
import { CommitChip } from '../../components/CommitChip'
import { Segmented } from '../../components/Segmented'
import { useApp } from '../../stores/app'
import { useContracts } from '../../stores/contracts'
import { useFeed } from '../../stores/feed'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import { openContractChange } from '../contracts/ContractChips'
import { reverseContractLinks } from '../contracts/contract-links'
import {
  ACTIVITY_KINDS,
  type ActivityKind,
  actorTallies,
  collapseChurn,
  dayLabel,
  type FeedAction,
  type FeedActionCtx,
  type FeedItem,
  feedActions,
  filterEvents,
  flipLabel,
  groupItemsByDay,
  kindCounts,
  relativeTime,
} from './feed-logic'

/** Reference 07 chip label + tone per git kind. */
export const KIND_CHIP: Record<ActivityKind, { label: string; tone: 'ok' | 'warn' | 'info' }> = {
  consume: { label: 'CONSUME', tone: 'ok' },
  route: { label: 'FILE', tone: 'ok' },
  handoff: { label: 'HANDOFF', tone: 'warn' },
  status: { label: 'STATUS', tone: 'info' },
  sync: { label: 'SYNC', tone: 'info' },
}

/** Row time: HH:MM today, "jul 12" otherwise. Pure. */
export function rowTime(at: string, today: string): string {
  if (at.slice(0, 10) === today) return at.slice(11, 16)
  const d = new Date(at)
  return d
    .toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    .toLowerCase()
}

/** Card-click navigation (kept from 6.2): board / reader / sync panel. */
function open(event: ActivityEvent): void {
  const app = useApp.getState()
  const path = event.subject.path
  if (event.kind === 'sync') {
    app.setView('sync')
  } else if (event.subject.handoffId && !path) {
    app.setView('handoffs')
  } else if (path) {
    app.setView('reader')
    const vaultPath = app.identity?.vaultPath ?? ''
    void useReader.getState().open(toVaultRelative(path, vaultPath))
  } else {
    app.setView('handoffs')
  }
}

/** D1 action wiring (AC5): each link lands on an existing store/route. */
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

function ActionLinks({ actions }: { actions: FeedAction[] }): React.JSX.Element | null {
  if (actions.length === 0) return null
  return (
    <>
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="act-link"
          onClick={(e) => {
            e.stopPropagation()
            performFeedAction(action)
          }}
        >
          {action.label.toLowerCase()}
        </button>
      ))}
    </>
  )
}

function Row({
  event,
  summary,
  commitBase,
  today,
  actions,
  extra,
}: {
  event: ActivityEvent
  summary: React.ReactNode
  commitBase: string | null
  today: string
  actions: FeedAction[]
  extra?: React.ReactNode
}): React.JSX.Element {
  const chip = KIND_CHIP[event.kind]
  return (
    <div
      role="button"
      tabIndex={0}
      className="act-row"
      onClick={() => open(event)}
      onKeyDown={(e) => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === e.currentTarget) {
          e.preventDefault()
          open(event)
        }
      }}
    >
      <span className={`act-chip is-${chip.tone}`}>{chip.label}</span>
      <span className="act-sentence" title={event.summary}>
        {summary}
      </span>
      <span className="act-time" title={event.at}>
        {rowTime(event.at, today)}
      </span>
      <span className="act-sha">
        <CommitChip sha={event.sha} base={commitBase} />
      </span>
      <ActionLinks actions={actions} />
      {extra}
    </div>
  )
}

function ChurnRow(props: {
  item: Extract<FeedItem, { type: 'churn' }>
  commitBase: string | null
  today: string
  actions: FeedAction[]
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const newest = props.item.events[0] as ActivityEvent
  return (
    <>
      <Row
        event={newest}
        summary={
          <>
            <b>{props.item.actor.name}</b> status churn ×{props.item.events.length} on{' '}
            <span className="act-id">{props.item.handoffId}</span>
          </>
        }
        commitBase={props.commitBase}
        today={props.today}
        actions={props.actions}
        extra={
          <button
            type="button"
            className="act-link"
            onClick={(e) => {
              e.stopPropagation()
              setExpanded((v) => !v)
            }}
          >
            {expanded ? 'hide' : `${props.item.events.length} flips`}
          </button>
        }
      />
      {expanded &&
        props.item.events.map((flip) => (
          <div className="act-flip" key={flip.sha}>
            <span className="act-time">{flip.at.slice(11, 16)}</span>
            <span>{flipLabel(flip.summary)}</span>
            <CommitChip sha={flip.sha} base={props.commitBase} />
          </div>
        ))}
    </>
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
  const cards = useHandoffs((s) => s.cards)
  const changes = useContracts((s) => s.changes)
  const contractsLoading = useContracts((s) => s.loading)

  useEffect(() => {
    if (events === null) void load()
  }, [events, load])
  useEffect(() => {
    if (cards === null) void useHandoffs.getState().load()
  }, [cards])
  useEffect(() => {
    if (changes === null && !contractsLoading) void useContracts.getState().load()
  }, [changes, contractsLoading])

  const [kind, setKind] = useState<ActivityKind | 'all'>('all')
  const [actorKey, setActorKey] = useState<string | 'all'>('all')

  const linksByHandoff = useMemo(() => reverseContractLinks(changes ?? []), [changes])
  const all = events ?? []
  const counts = useMemo(() => kindCounts(all), [all])
  const actors = useMemo(() => actorTallies(all), [all])
  const filtered = useMemo(() => filterEvents(all, kind, actorKey), [all, kind, actorKey])
  const items = useMemo(() => collapseChurn(filtered), [filtered])

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
  const SEG_LABEL: Record<ActivityKind, string> = {
    handoff: 'Handoffs',
    route: 'Files',
    status: 'Status',
    consume: 'Consumes',
    sync: 'Syncs',
  }
  const segOptions = [
    { value: 'all' as const, label: 'All' },
    ...ACTIVITY_KINDS.filter((k) => counts[k] > 0).map((k) => ({ value: k, label: SEG_LABEL[k] })),
  ]

  return (
    <div className="feed">
      <div className="plan-head">
        <span className="plan-title">Activity</span>
        <Segmented ariaLabel="Activity kind" options={segOptions} value={kind} onChange={setKind} />
        <span className="plan-filters">
          <select
            className="plan-filter"
            aria-label="Person filter"
            value={actorKey}
            onChange={(e) => setActorKey(e.target.value)}
          >
            <option value="all">everyone</option>
            {actors.map((a) => (
              <option key={a.email || a.name} value={a.email || a.name}>
                {a.name}
              </option>
            ))}
          </select>
          <span className="plan-filter-sep">· from the dex git log</span>
          <button
            type="button"
            className="act-link"
            title="Re-read the vault git log"
            onClick={() => void load()}
          >
            {loading ? 'refreshing…' : 'refresh'}
          </button>
        </span>
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
      ) : items.length === 0 ? (
        <div className="feed-none">
          <p>No matching activity.</p>
          <button
            type="button"
            className="button-quiet"
            onClick={() => {
              setKind('all')
              setActorKey('all')
            }}
          >
            Clear filters
          </button>
        </div>
      ) : (
        <div className="act-scroll">
          <div className="act-col">
            {groupItemsByDay(items).map((group) => (
              <section key={group.day} aria-label={group.day}>
                <div className="act-day">{dayLabel(group.day, today).toUpperCase()}</div>
                <div className="act-card">
                  {group.items.map((item) => {
                    const head =
                      item.type === 'churn' ? (item.events[0] as ActivityEvent) : item.event
                    const actions = feedActions(head, ctxFor(head))
                    return item.type === 'churn' ? (
                      <ChurnRow
                        key={head.sha}
                        item={item}
                        commitBase={commitBase}
                        today={today}
                        actions={actions}
                      />
                    ) : (
                      <Row
                        key={head.sha}
                        event={head}
                        summary={
                          <>
                            <b>{head.actor.name}</b> {head.summary}
                          </>
                        }
                        commitBase={commitBase}
                        today={today}
                        actions={actions}
                      />
                    )
                  })}
                </div>
              </section>
            ))}
            {kind === 'all' && actorKey === 'all' && (
              <button
                type="button"
                className="button-quiet feed-more"
                disabled={loading}
                onClick={() => void loadMore()}
              >
                Load older activity
              </button>
            )}
            <div className="plan-foot">
              every consume · file · status · handoff · sync — one attributed git commit each ·
              newest {relativeTime(all[0]?.at ?? new Date(now).toISOString(), now)}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
