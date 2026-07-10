/**
 * Activity feed (story 6.2): who routed/synced/consumed what, straight from
 * the vault git log via the lib's activity grammar. Day headers, initials
 * avatars, click-through to note / board / sync panel.
 */
import { useEffect } from 'react'
import { toVaultRelative } from '../../../../shared/handoff-lanes'
import type { ActivityEvent } from '../../../../shared/types'
import { useApp } from '../../stores/app'
import { useFeed } from '../../stores/feed'
import { useReader } from '../../stores/reader'
import { dayLabel, groupByDay, initials, noteBasename, targetOf } from './feed-logic'

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

function EventRow({ event }: { event: ActivityEvent }): React.JSX.Element {
  const path = event.subject.path
  return (
    // dense row shows the basename; the hover title carries the full vault
    // path (defect 14.2-2)
    <button
      type="button"
      className="feed-row"
      title={path ?? undefined}
      onClick={() => open(event)}
    >
      <span className="feed-avatar" aria-hidden>
        {initials(event.actor.name)}
      </span>
      <span className="feed-main">
        <span className="feed-summary">{event.summary}</span>
        <span className="feed-meta">
          <span className={`feed-kind feed-kind-${event.kind}`}>{event.kind}</span>{' '}
          {event.actor.name} · {event.at.slice(11, 16)}
          {path ? ` · ${noteBasename(path)}` : ''}
        </span>
      </span>
    </button>
  )
}

export function FeedView(): React.JSX.Element {
  const events = useFeed((s) => s.events)
  const loading = useFeed((s) => s.loading)
  const error = useFeed((s) => s.error)
  const load = useFeed((s) => s.load)
  const loadMore = useFeed((s) => s.loadMore)

  useEffect(() => {
    if (events === null) void load()
  }, [events, load])

  const today = new Date().toISOString().slice(0, 10)

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
          {groupByDay(events).map((group) => (
            <section key={group.day} aria-label={group.day}>
              <h2 className="feed-day">{dayLabel(group.day, today)}</h2>
              {group.events.map((event) => (
                <EventRow key={event.sha} event={event} />
              ))}
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
