/**
 * Inbox (DESIGN v3 §5, story 26.3) — replaces the Handoffs board with the
 * two-pane triage surface: For me / Created / All lanes over the same
 * company-wide fetch (lanes stay pure handoff-lanes derivations), a RowItem
 * list (glyph + two-line anatomy), and a detail pane — chips, objective,
 * mono meta, numbered reading order, thread rail, contract chips — closed by
 * the §4 floating action bar (Comment · Hand back · state-legal A/D/S +
 * Consume E). Everything the v2 board could do keeps a home here (§5.1):
 * project scoping, Active/Done/All display filter, unread dots, receipts,
 * compose/decline/snooze/link-request/comment modals, ⌘⏎ consume.
 */
import { useEffect, useState } from 'react'
import type { HandoffCard } from '../../../../shared/types'
import {
  actionsFor,
  filterByDisplay,
  fulfilledByMap,
  hiddenCount,
  type InboxLane,
  laneCards,
  projectsOf,
} from '../../../../shared/handoff-lanes'
import { isErrEnvelope } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'
import { Button } from '../../components/Button'
import { ConsumeReceiptView } from '../../components/ConsumeReceiptView'
import { RowItem } from '../../components/RowItem'
import { Segmented } from '../../components/Segmented'
import { StatusChip, StatusGlyph } from '../../components/StatusChip'
import { humanizeTitle } from '../../humanize'
import { AgentChip } from '../../components/AgentChip'
import { useBoardFilter } from '../../stores/boardFilter'
import { useHandoffs } from '../../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useToasts } from '../../stores/toasts'
import { ContractChips } from '../contracts/ContractChips'
import { relativeTime } from '../feed/feed-logic'
import { LIVE_WINDOW_MS } from '../agents/AgentsView'
import { useDashboardData } from '../home/dashboard-data'
import { openBrief } from './open-brief'
import { ThreadRail } from './ThreadRail'

/** Row glyph state: expired snoozes surface as stale (derived, never written). */
export function rowStatus(card: HandoffCard): string {
  return card.expired ? 'expired' : card.status
}

/** Archive/Delete for the vertical panel (user request: stacked buttons). */
function RemoveButtons({ card, disabled }: { card: HandoffCard; disabled: boolean }): React.JSX.Element | null {
  const identity = useIdentity((s) => effectiveIdentity(s))
  const [confirm, setConfirm] = useState(false)
  useEffect(() => setConfirm(false), [card])
  if (!identity) return null
  const run = async (mode: 'delete' | 'archive'): Promise<void> => {
    try {
      await invoke('vault.removeNote', { path: card.path, mode, identity })
      useToasts
        .getState()
        .push(
          mode === 'archive' ? 'Handoff archived' : 'Handoff deleted',
          `${card.id} · committed — will push on next sync`,
        )
      void useHandoffs.getState().load()
    } catch (e) {
      useToasts.getState().push('Could not remove handoff', isErrEnvelope(e) ? `${(e as { code: string }).code}: ${(e as { message: string }).message}` : String(e))
    }
  }
  return (
    <>
      <Button variant="quiet" disabled={disabled} title="Move to _archive/ (one commit)" onClick={() => void run('archive')}>
        Archive
      </Button>
      <Button
        variant="danger"
        disabled={disabled}
        title="Delete this handoff note (one commit)"
        onClick={() => (confirm ? void run('delete') : setConfirm(true))}
      >
        {confirm ? 'Confirm delete' : 'Delete…'}
      </Button>
    </>
  )
}

/** Reference 02 sub line: open rows carry the route, later states carry the
 *  state word — the glyph never stands alone. Pure. */
export function rowSub(card: HandoffCard): string {
  const age = `${card.ageDays}d`
  if (card.expired) return `snooze expired · ${age}`
  switch (card.status) {
    case 'accepted':
      return `accepted · ${age}`
    case 'snoozed':
      return card.snoozedUntil ? `snoozed until ${card.snoozedUntil}` : `snoozed · ${age}`
    case 'declined':
      return `declined · ${age}`
    case 'consumed':
      return `consumed · ${age}`
    default:
      return `${card.from} ⟶ ${card.to} · ${card.kind} · ${age}`
  }
}

const TERMINAL = new Set(['declined', 'consumed'])

/** Reference 02 right tag on reading-order rows: the note's frontmatter
 *  type, resolved like the reader resolves wikilinks. Best-effort. */
function useReadingOrderKinds(card: HandoffCard): Record<string, string> {
  const [kinds, setKinds] = useState<Record<string, string>>({})
  useEffect(() => {
    setKinds({})
    let stale = false
    void (async () => {
      const out: Record<string, string> = {}
      for (const name of card.readingOrder.slice(0, 8)) {
        try {
          const res = await invoke('vault.resolveLink', { link: name, from: card.path })
          if (res.status !== 'resolved' || !res.target) continue
          const doc = await invoke('vault.readNote', { path: res.target })
          const t = (doc.meta as Record<string, unknown>).type
          if (typeof t === 'string' && t) out[name] = t
        } catch {
          /* unresolved link — row stays untagged */
        }
      }
      if (!stale) setKinds(out)
    })()
    return () => {
      stale = true
    }
  }, [card])
  return kinds
}

function DetailPane({ card }: { card: HandoffCard }): React.JSX.Element {
  const consume = useHandoffs((s) => s.consume)
  const setStatus = useHandoffs((s) => s.setStatus)
  const openDecline = useHandoffs((s) => s.openDecline)
  const openSnooze = useHandoffs((s) => s.openSnooze)
  const openCompose = useHandoffs((s) => s.openCompose)
  const openAnnotate = useHandoffs((s) => s.openAnnotate)
  const openLinkRequest = useHandoffs((s) => s.openLinkRequest)
  const pressedId = useHandoffs((s) => s.pressedId)
  const busy = useHandoffs((s) => s.consumingId !== null || s.transitioningId !== null)
  const hasIdentity = useIdentity((s) => effectiveIdentity(s) !== null)
  const fulfilled = fulfilledByMap(useHandoffs((s) => s.cards) ?? [])
  const disabled = !hasIdentity || busy
  const idleTitle = hasIdentity ? undefined : 'Set your identity in Settings first'
  const actions = actionsFor(card, true)
  const fulfilledBy = fulfilled.get(card.id)
  // §6.5 presence: the last identity that touched this handoff (git
  // attribution), live-dotted inside the write window — read-only
  const activity = useDashboardData((s) => s.activity)
  const touch = (activity ?? []).find((e) => e.subject.handoffId === card.id && e.actor.name)
  const roKinds = useReadingOrderKinds(card)

  return (
    <div className="inbox-detail" aria-label="Handoff detail">
      <div className="inbox-detail-main">
      <div className="inbox-detail-chips">
        <StatusChip status={rowStatus(card)} pressed={pressedId === card.id} />
        {card.kind === 'request' && <StatusChip status="request" />}
        <span className="triage-route">
          {card.from} ⟶ {card.to}
        </span>
        {touch && (
          <AgentChip
            name={touch.actor.name}
            meta={relativeTime(touch.at, Date.now())}
            live={Date.now() - Date.parse(touch.at) < LIVE_WINDOW_MS}
          />
        )}
      </div>
      <h2 className="inbox-detail-title" title={card.name}>
        {card.objective || humanizeTitle(card.name)}
      </h2>
      <div className="inbox-detail-meta">
        from {card.from} · {card.date || `${card.ageDays}d ago`} · {card.id}
        {card.snoozedUntil ? ` · snoozed until ${card.snoozedUntil}` : ''}
      </div>
      {fulfilledBy && fulfilledBy.length > 0 && (
        <div className="inbox-detail-meta">fulfilled by {fulfilledBy.join(', ')}</div>
      )}
      <ContractChips handoffId={card.id} />

      {card.readingOrder.length > 0 && (
        <section aria-label="Reading order">
          <div className="today-sect">
            <span className="today-sect-label">
              reading order · {card.kind === 'request' ? 'the ask' : 'the spec'}
            </span>
          </div>
          {card.readingOrder.map((name, i) => (
            <button
              key={name}
              type="button"
              className="ro-row"
              title={`Open the brief with its reading order (${name})`}
              onClick={() => openBrief(card)}
            >
              <span className="ro-num">{String(i + 1).padStart(2, '0')}</span>
              <span className="ro-name">{humanizeTitle(name)}</span>
              {roKinds[name] && <span className="ro-kind">{roKinds[name]}</span>}
            </button>
          ))}
        </section>
      )}

      <div className="inbox-detail-open">
        <Button variant="quiet" onClick={() => openBrief(card)}>
          Open in Reader →
        </Button>
      </div>

      <ThreadRail id={card.id} />
      </div>

      {/* vertical action panel (user request 2026-07-17): one column of
          stacked buttons on the right — ONE cobalt primary on top */}
      <aside className="inbox-actions" role="toolbar" aria-label="Handoff actions">
        {(card.status === 'open' || card.status === 'accepted') && (
          <Button
            variant="primary"
            kbd="E"
            disabled={disabled}
            title={idleTitle ?? 'Consume — mark it done for real (⌘⏎)'}
            onClick={() => void consume(card)}
          >
            ✓ Consume
          </Button>
        )}
        {actions.includes('accept') && (
          <Button
            kbd="A"
            disabled={disabled}
            title={idleTitle ?? 'Accept — you will take this up'}
            onClick={() => void setStatus(card, { to: 'accepted' })}
          >
            Accept
          </Button>
        )}
        {actions.includes('decline') && (
          <Button
            variant="danger"
            kbd="D"
            disabled={disabled}
            title={idleTitle ?? 'Decline with a reason (reversible)'}
            onClick={() => openDecline(card)}
          >
            Decline
          </Button>
        )}
        {actions.includes('snooze') && (
          <Button
            kbd="S"
            disabled={disabled}
            title={idleTitle ?? 'Snooze until a date'}
            onClick={() => openSnooze(card)}
          >
            Snooze
          </Button>
        )}
        {actions.includes('reopen') && (
          <Button
            disabled={disabled}
            title={idleTitle ?? 'Reopen — back to the open lane'}
            onClick={() => void setStatus(card, { to: 'open' })}
          >
            Reopen
          </Button>
        )}
        <span className="inbox-actions-sep" aria-hidden />
        <Button
          variant="quiet"
          title="Comment — a quick note in the thread. No new card is created."
          onClick={() => openAnnotate(card)}
        >
          Comment
        </Button>
        <Button
          variant="emphasis"
          title="Hand back — creates a new handoff the other team must consume."
          onClick={() => openCompose(card)}
        >
          Hand back
        </Button>
        {card.kind === 'delivery' && !card.fulfills && (
          <Button
            variant="quiet"
            title="Link this delivery to the request it fulfills"
            onClick={() => openLinkRequest(card)}
          >
            Link request
          </Button>
        )}
        <span className="inbox-actions-sep" aria-hidden />
        <RemoveButtons card={card} disabled={busy} />
      </aside>
    </div>
  )
}

export function InboxView(): React.JSX.Element {
  const cards = useHandoffs((s) => s.cards)
  const error = useHandoffs((s) => s.error)
  const project = useHandoffs((s) => s.project)
  const receipt = useHandoffs((s) => s.receipt)
  const selectedId = useHandoffs((s) => s.selectedId)
  const readAt = useHandoffs((s) => s.readAt)
  const load = useHandoffs((s) => s.load)
  const select = useHandoffs((s) => s.select)
  const setProject = useHandoffs((s) => s.setProject)
  const dismissReceipt = useHandoffs((s) => s.dismissReceipt)
  const identityLoaded = useIdentity((s) => s.loaded)
  const loadIdentity = useIdentity((s) => s.load)
  const lane = useBoardFilter((s) => s.lane)
  const setLane = useBoardFilter((s) => s.setLane)
  const filterMode = useBoardFilter((s) => s.mode)
  const setFilterMode = useBoardFilter((s) => s.set)

  useEffect(() => {
    if (!identityLoaded) void loadIdentity()
  }, [identityLoaded, loadIdentity])
  useEffect(() => {
    if (cards === null) void load()
  }, [cards, load])

  const allCards = cards ?? []
  const projects = projectsOf(allCards)
  // D1 amendment 6: display-only filter — the Inbox opens as a work surface
  const inLane = laneCards(allCards, lane, project)
  const shown = filterByDisplay(inLane, filterMode)
  const hidden = hiddenCount(inLane, filterMode)
  const selected = shown.find((c) => c.id === selectedId) ?? shown[0]
  const openCount = inLane.filter((c) => c.status === 'open' || c.expired).length

  return (
    <div className="inbox">
      <div className="inbox-list" aria-label="Inbox list">
        <div className="inbox-list-head">
          <Segmented
            ariaLabel="Lane"
            options={[
              { value: 'forme' as InboxLane, label: 'For me' },
              { value: 'created' as InboxLane, label: 'Created' },
              { value: 'all' as InboxLane, label: 'All' },
            ]}
            value={lane}
            onChange={setLane}
          />
          <span className="inbox-open-count">{openCount} open</span>
        </div>
        {error && <div className="note-error">{error}</div>}
        {receipt && <ConsumeReceiptView receipt={receipt} onDismiss={dismissReceipt} />}
        <div className="today-sect">
          <span className="today-sect-label">
            inbox · {shown.length}
            {hidden > 0 ? ` · ${hidden} done hidden` : ''}
          </span>
          {hidden > 0 && (
            <button type="button" className="today-sect-link" onClick={() => setFilterMode('all')}>
              show all
            </button>
          )}
          <button
            type="button"
            className="act-link inbox-new"
            title="Compose a handoff (⌘N)"
            onClick={() => useHandoffs.getState().openCompose()}
          >
            ＋ new
          </button>
        </div>
        <div className="inbox-filters-row">
          <select
            className="plan-filter"
            aria-label="Project scope"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            <option value="all">project: all</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
          <select
            className="plan-filter"
            aria-label="Show"
            value={filterMode}
            onChange={(e) => setFilterMode(e.target.value as 'active' | 'done' | 'all')}
          >
            <option value="active">state: active</option>
            <option value="done">state: done</option>
            <option value="all">state: all</option>
          </select>
        </div>
        {cards === null ? (
          <div className="inbox-skeleton" aria-hidden>
            <div className="handoff-card skeleton" />
            <div className="handoff-card skeleton" />
          </div>
        ) : shown.length === 0 ? (
          <div className="empty-state" style={{ border: 'none' }}>
            <p>
              {inLane.length === 0
                ? 'No handoffs here yet.'
                : filterMode === 'active'
                  ? "No active handoffs — you're all caught up."
                  : 'Nothing in this view.'}
            </p>
            {hidden > 0 && <Button onClick={() => setFilterMode('all')}>Show done ({hidden})</Button>}
          </div>
        ) : (
          shown.map((card) => (
            <RowItem
              key={card.id}
              title={card.objective || humanizeTitle(card.name)}
              sub={rowSub(card)}
              glyph={<StatusGlyph status={rowStatus(card)} />}
              trailing={readAt[card.id] === null ? <span className="unread-dot" /> : undefined}
              selected={selected?.id === card.id}
              dimmed={TERMINAL.has(card.status)}
              onActivate={() => select(card.id)}
            />
          ))
        )}
      </div>
      {selected ? (
        <DetailPane card={selected} />
      ) : (
        <div className="inbox-detail inbox-detail-empty">
          <p className="ops-clear">Select a handoff to triage it.</p>
        </div>
      )}
    </div>
  )
}
