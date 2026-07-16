/**
 * Plan (DESIGN v3 §5/§6.4, story 26.4) — Board · Backlog · Sprints over
 * unified work items. Ships behind the plan preview flag reading handoffs
 * only (§6.4): until the lib work-item schema (§8) lands, columns derive
 * from the 8.1 handoff state machine —
 *   Triage = open/expired (A/D/S one-key), Parked = snoozed,
 *   In progress = accepted (Consume E), Done = consumed · declined.
 * Sprints is an honest §8-blocked empty state, never fake data. Transitions
 * ride the same store writers as Today/Inbox — no second engine.
 */
import { useEffect } from 'react'
import type { HandoffCard } from '../../../../shared/types'
import { actionsFor, laneCards } from '../../../../shared/handoff-lanes'
import { Button } from '../../components/Button'
import { Segmented } from '../../components/Segmented'
import { StatusGlyph } from '../../components/StatusChip'
import { humanizeTitle } from '../../humanize'
import { useHandoffs } from '../../stores/handoffs'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { usePlanTab } from '../../stores/planFlagTab'
import { sectionTint } from '../reader/sectionTint'
import { openBrief } from '../handoffs/open-brief'
import { rowStatus } from '../handoffs/InboxView'

export type PlanColumn = 'triage' | 'parked' | 'doing' | 'done'

export const COLUMNS: ReadonlyArray<{ key: PlanColumn; label: string }> = [
  { key: 'triage', label: 'Triage' },
  { key: 'parked', label: 'Parked' },
  { key: 'doing', label: 'In progress' },
  { key: 'done', label: 'Done' },
]

/** Handoff → board column (flagged mode, §6.4): pure 8.1-state mapping. */
export function columnOf(card: Pick<HandoffCard, 'status' | 'expired'>): PlanColumn {
  if (card.status === 'open' || card.expired) return 'triage'
  if (card.status === 'snoozed') return 'parked'
  if (card.status === 'accepted') return 'doing'
  return 'done' // consumed · declined · anything terminal
}

export function boardColumns(
  cards: readonly HandoffCard[],
): Record<PlanColumn, HandoffCard[]> {
  const cols: Record<PlanColumn, HandoffCard[]> = {
    triage: [],
    parked: [],
    doing: [],
    done: [],
  }
  for (const c of cards) cols[columnOf(c)].push(c)
  cols.triage.sort((a, b) => b.ageDays - a.ageDays)
  return cols
}

function PlanCard({ card }: { card: HandoffCard }): React.JSX.Element {
  const consume = useHandoffs((s) => s.consume)
  const setStatus = useHandoffs((s) => s.setStatus)
  const openDecline = useHandoffs((s) => s.openDecline)
  const openSnooze = useHandoffs((s) => s.openSnooze)
  const select = useHandoffs((s) => s.select)
  const busy = useHandoffs((s) => s.consumingId !== null || s.transitioningId !== null)
  const hasIdentity = useIdentity((s) => effectiveIdentity(s) !== null)
  const disabled = !hasIdentity || busy
  const actions = actionsFor(card, true)
  return (
    <div
      className="plan-card"
      role="button"
      tabIndex={0}
      onClick={() => openBrief(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openBrief(card)
      }}
      onMouseEnter={() => select(card.id)}
    >
      <div className="plan-card-head">
        <StatusGlyph status={rowStatus(card)} />
        <span className="plan-card-kind">{card.kind}</span>
        <span className="plan-card-id" title={card.name}>
          {card.id}
        </span>
      </div>
      <p className="plan-card-title">{card.objective || humanizeTitle(card.name)}</p>
      <div className="plan-card-foot">
        <span className="ops-dot" style={{ background: sectionTint(card.to) }} aria-hidden="true" />
        <span className="plan-card-proj">{card.to}</span>
        <span className="plan-card-age">{card.ageDays}d</span>
        <span className="plan-card-actions">
          {actions.includes('accept') && (
            <Button
              variant="quiet"
              kbd="A"
              disabled={disabled}
              title="Accept"
              onClick={(e) => {
                e.stopPropagation()
                void setStatus(card, { to: 'accepted' })
              }}
            >
              ✓
            </Button>
          )}
          {actions.includes('decline') && (
            <Button
              variant="quiet"
              kbd="D"
              disabled={disabled}
              title="Decline…"
              onClick={(e) => {
                e.stopPropagation()
                openDecline(card)
              }}
            >
              ✕
            </Button>
          )}
          {actions.includes('snooze') && (
            <Button
              variant="quiet"
              kbd="S"
              disabled={disabled}
              title="Snooze…"
              onClick={(e) => {
                e.stopPropagation()
                openSnooze(card)
              }}
            >
              ⏲
            </Button>
          )}
          {card.status === 'accepted' && (
            <Button
              variant="quiet"
              kbd="E"
              disabled={disabled}
              title="Consume"
              onClick={(e) => {
                e.stopPropagation()
                void consume(card)
              }}
            >
              Consume
            </Button>
          )}
          {actions.includes('reopen') && (
            <Button
              variant="quiet"
              disabled={disabled}
              title="Reopen"
              onClick={(e) => {
                e.stopPropagation()
                void setStatus(card, { to: 'open' })
              }}
            >
              Reopen
            </Button>
          )}
        </span>
      </div>
    </div>
  )
}

export function PlanView(): React.JSX.Element {
  const cards = useHandoffs((s) => s.cards)
  const project = useHandoffs((s) => s.project)
  const load = useHandoffs((s) => s.load)
  const tab = usePlanTab((s) => s.tab)
  const setTab = usePlanTab((s) => s.setTab)

  useEffect(() => {
    if (cards === null) void load()
  }, [cards, load])

  const all = laneCards(cards ?? [], 'all', project)
  const cols = boardColumns(all)

  return (
    <div className="plan">
      <div className="plan-head">
        <div className="ops-titlewrap">
          <h1 className="ops-title">Plan</h1>
          <span className="ops-subtitle">
            preview · handoffs only — tasks & sprints land with the work-item schema (§8)
          </span>
        </div>
        <Segmented
          ariaLabel="Plan tab"
          options={[
            { value: 'board' as const, label: 'Board' },
            { value: 'backlog' as const, label: 'Backlog' },
            { value: 'sprints' as const, label: 'Sprints' },
          ]}
          value={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'board' && (
        <div className="plan-board">
          {COLUMNS.map(({ key, label }) => (
            <section key={key} className="plan-col" aria-label={label}>
              <div className="today-sect">
                <span className="today-sect-label">{label}</span>
                <span className="today-sect-note">{cols[key].length}</span>
              </div>
              {cols[key].length === 0 ? (
                <div className="plan-col-empty">—</div>
              ) : (
                cols[key].map((card) => <PlanCard key={card.id} card={card} />)
              )}
            </section>
          ))}
        </div>
      )}

      {tab === 'backlog' && (
        <div className="plan-backlog">
          <div className="today-sect">
            <span className="today-sect-label">
              backlog · parked + triage, oldest first · {cols.parked.length + cols.triage.length}
            </span>
          </div>
          {[...cols.triage, ...cols.parked].length === 0 ? (
            <div className="ops-clear">Nothing waiting — the backlog is clear.</div>
          ) : (
            [...cols.triage, ...cols.parked].map((card) => <PlanCard key={card.id} card={card} />)
          )}
        </div>
      )}

      {tab === 'sprints' && (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Sprints need the work-item schema (kind · sprint · owner) — a loredex lib change, not a view.</p>
          <Button onClick={() => setTab('board')}>Back to Board</Button>
        </div>
      )}
    </div>
  )
}
