/**
 * Plan (v3 parity slice E — reference 03): Board · Backlog · Sprints over
 * the lib's REAL work-item plane (loredex ≥ 2.8, `work.list`). Columns:
 *   TRIAGE (open handoffs/requests — human triage A/D/S) · TODO (tasks) ·
 *   IN PROGRESS (doing) · REVIEW · DONE·CONSUMED (dimmed).
 * Cards carry the reference anatomy: caps kind chip + mono id → title →
 * project dot · P? · S? · actions. Handoff transitions ride the handoffs
 * store (8.1 machine); task moves ride the one work writer. Drag-and-drop
 * (user request 2026-07-18) runs the SAME transitions as the buttons —
 * dropAction() is the pure legality map; decline/snooze stay buttons (they
 * need a reason/date a drop can't carry). "＋ New item" opens the compose
 * modal (handoff/request) — the lib has no createWorkItem yet.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import type { WorkItem } from '../../../../shared/ipc-contract'
import { Button } from '../../components/Button'
import { Segmented } from '../../components/Segmented'
import { useHandoffs } from '../../stores/handoffs'
import { usePlanTab } from '../../stores/planFlagTab'
import { useWork } from '../../stores/work'
import { sectionTint } from '../reader/sectionTint'
import { openBrief } from '../handoffs/open-brief'

export type PlanColumn = 'triage' | 'todo' | 'doing' | 'review' | 'done'

export const COLUMNS: ReadonlyArray<{ key: PlanColumn; label: string }> = [
  { key: 'triage', label: 'TRIAGE' },
  { key: 'todo', label: 'TODO' },
  { key: 'doing', label: 'IN PROGRESS' },
  { key: 'review', label: 'REVIEW' },
  { key: 'done', label: 'DONE · CONSUMED' },
]

/** Reference 03 column mapping over the lib board plane. Pure. */
export function columnOf(item: Pick<WorkItem, 'kind' | 'status'>): PlanColumn | 'backlog' {
  if (item.status === 'backlog') return 'backlog'
  if (item.status === 'todo') return item.kind === 'task' ? 'todo' : 'triage'
  if (item.status === 'doing') return 'doing'
  if (item.status === 'review') return 'review'
  return 'done' // done · consumed
}

/** Drag legality (user request 2026-07-18): what dropping ITEM on COL does.
 *  Tasks move freely between their four columns; handoffs ride the 8.1
 *  machine — accept (→ doing), reopen (→ triage), consume (→ done).
 *  Decline/snooze stay buttons: they need a reason/date a drop can't carry.
 *  Pure — unit-tested. */
export type DropAction =
  | { kind: 'task'; status: 'todo' | 'doing' | 'review' | 'done' }
  | { kind: 'accept' }
  | { kind: 'reopen' }
  | { kind: 'consume' }

export function dropAction(
  item: Pick<WorkItem, 'kind' | 'status'>,
  col: PlanColumn,
): DropAction | null {
  const from = columnOf(item)
  if (from === col) return null
  if (item.kind === 'task') {
    if (col === 'triage') return null // triage is the handoff lane
    return { kind: 'task', status: col === 'done' ? 'done' : col }
  }
  // handoff/request
  if (col === 'doing' && item.status === 'todo') return { kind: 'accept' }
  if (col === 'triage' && (item.status === 'doing' || item.status === 'done'))
    return { kind: 'reopen' }
  if (col === 'done' && (item.status === 'todo' || item.status === 'doing'))
    return { kind: 'consume' }
  return null
}

export function boardColumns(items: readonly WorkItem[]): Record<PlanColumn, WorkItem[]> {
  const cols: Record<PlanColumn, WorkItem[]> = {
    triage: [],
    todo: [],
    doing: [],
    review: [],
    done: [],
  }
  for (const item of items) {
    const col = columnOf(item)
    if (col !== 'backlog') cols[col].push(item)
  }
  return cols
}

/** the card mid-drag — dragover can't read dataTransfer, so module state */
let draggingItem: WorkItem | null = null

function KindChip({ item }: { item: WorkItem }): React.JSX.Element {
  if (item.status === 'review') return <span className="plan-check is-ok">✓</span>
  if (item.status === 'done' || item.status === 'consumed')
    return <span className="plan-check">–</span>
  if (item.kind === 'task') return <span className="plan-kind plan-kind--info">TASK</span>
  const open = item.status === 'todo'
  return (
    <span className="plan-kind plan-kind--warn">{open ? '● OPEN' : 'HANDOFF'}</span>
  )
}

function PlanCard({ item }: { item: WorkItem }): React.JSX.Element {
  const cards = useHandoffs((s) => s.cards)
  const setStatus = useHandoffs((s) => s.setStatus)
  const openDecline = useHandoffs((s) => s.openDecline)
  const openSnooze = useHandoffs((s) => s.openSnooze)
  const update = useWork((s) => s.update)
  const isHandoff = item.kind !== 'task'
  const card = isHandoff ? (cards ?? []).find((c) => c.id === item.id) : undefined
  const done = item.status === 'done' || item.status === 'consumed'
  const inTriage = columnOf(item) === 'triage'
  const agent = item.delegate ?? item.owner

  const foot = [item.project || 'dex', item.priority, item.sprint].filter(Boolean).join(' · ')

  return (
    <div
      className={`plan-card${done ? ' is-done' : ''}`}
      role="button"
      tabIndex={0}
      draggable
      onDragStart={(e) => {
        draggingItem = item
        e.dataTransfer.effectAllowed = 'move'
        e.currentTarget.classList.add('is-dragging')
      }}
      onDragEnd={(e) => {
        draggingItem = null
        e.currentTarget.classList.remove('is-dragging')
      }}
      onClick={() => card && openBrief(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget && card) openBrief(card)
      }}
    >
      <div className="plan-card-head">
        <KindChip item={item} />
        <span className="plan-card-id" title={item.path}>
          {item.id}
        </span>
      </div>
      <p className="plan-card-title">{item.title}</p>
      {done ? (
        <div className="plan-card-donefoot">
          {item.status}
          {item.date ? ` · ${item.date}` : ''}
        </div>
      ) : (
        <div className="plan-card-foot">
          <span
            className="plan-proj-dot"
            style={{ background: sectionTint(item.project || 'dex') }}
            aria-hidden="true"
          />
          <span className="plan-card-meta">{foot}</span>
          <span className="plan-card-actions">
            {inTriage && card && (
              <>
                <Button
                  variant="quiet"
                  kbd="A"
                  title="Accept"
                  onClick={(e) => {
                    e.stopPropagation()
                    void setStatus(card, { to: 'accepted' })
                  }}
                >
                  {''}
                </Button>
                <Button
                  variant="quiet"
                  kbd="D"
                  title="Decline…"
                  onClick={(e) => {
                    e.stopPropagation()
                    openDecline(card)
                  }}
                >
                  {''}
                </Button>
                <Button
                  variant="quiet"
                  kbd="S"
                  title="Snooze…"
                  onClick={(e) => {
                    e.stopPropagation()
                    openSnooze(card)
                  }}
                >
                  {''}
                </Button>
              </>
            )}
            {item.status === 'doing' && agent && (
              <span className="plan-agent">{agent}</span>
            )}
            {item.kind === 'task' && item.status === 'todo' && (
              <Button
                variant="quiet"
                title="Start — status doing"
                onClick={(e) => {
                  e.stopPropagation()
                  void update(item.id, { status: 'doing' })
                }}
              >
                Start
              </Button>
            )}
            {item.kind === 'task' && item.status === 'doing' && (
              <Button
                variant="quiet"
                title="Send to review"
                onClick={(e) => {
                  e.stopPropagation()
                  void update(item.id, { status: 'review' })
                }}
              >
                Review
              </Button>
            )}
            {item.kind === 'task' && item.status === 'review' && (
              <Button
                variant="quiet"
                title="Mark done"
                onClick={(e) => {
                  e.stopPropagation()
                  void update(item.id, { status: 'done' })
                }}
              >
                Done
              </Button>
            )}
          </span>
        </div>
      )}
    </div>
  )
}

export function PlanView(): React.JSX.Element {
  const items = useWork((s) => s.items)
  const error = useWork((s) => s.error)
  const cards = useHandoffs((s) => s.cards)
  const tab = usePlanTab((s) => s.tab)
  const setTab = usePlanTab((s) => s.setTab)
  const [typeFilter, setTypeFilter] = useState<'all' | 'task' | 'handoff'>('all')
  const [projectFilter, setProjectFilter] = useState('all')
  const [sprintFilter, setSprintFilter] = useState('all')

  useEffect(() => {
    if (items === null) void useWork.getState().load()
    if (cards === null) void useHandoffs.getState().load()
  }, [items, cards])

  const sprints = useMemo(
    () => [...new Set((items ?? []).map((i) => i.sprint).filter(Boolean))].sort() as string[],
    [items],
  )
  const projects = useMemo(
    () => [...new Set((items ?? []).map((i) => i.project).filter(Boolean))].sort(),
    [items],
  )

  const filtered = useMemo(() => {
    let list = items ?? []
    if (typeFilter === 'task') list = list.filter((i) => i.kind === 'task')
    if (typeFilter === 'handoff') list = list.filter((i) => i.kind !== 'task')
    if (projectFilter !== 'all') list = list.filter((i) => i.project === projectFilter)
    if (sprintFilter !== 'all') list = list.filter((i) => i.sprint === sprintFilter)
    return list
  }, [items, typeFilter, projectFilter, sprintFilter])

  const cols = boardColumns(filtered)
  const backlog = filtered.filter((i) => i.status === 'backlog')
  const [dropCol, setDropCol] = useState<PlanColumn | null>(null)

  // drop = the same transitions the buttons run (user request 2026-07-18)
  const performDrop = (col: PlanColumn): void => {
    const item = draggingItem
    draggingItem = null
    setDropCol(null)
    if (!item) return
    const action = dropAction(item, col)
    if (!action) return
    if (action.kind === 'task') {
      void useWork.getState().update(item.id, { status: action.status })
      return
    }
    const card = (useHandoffs.getState().cards ?? []).find((c) => c.id === item.id)
    if (!card) return
    if (action.kind === 'accept') void useHandoffs.getState().setStatus(card, { to: 'accepted' })
    else if (action.kind === 'reopen') void useHandoffs.getState().setStatus(card, { to: 'open' })
    else void useHandoffs.getState().consume(card)
  }

  return (
    <div className="plan">
      <div className="plan-head">
        <span className="plan-title">Plan</span>
        <select
          className="sprint-pill"
          aria-label="Sprint filter"
          value={sprintFilter}
          onChange={(e) => setSprintFilter(e.target.value)}
        >
          <option value="all">all sprints</option>
          {sprints.map((sp) => (
            <option key={sp} value={sp}>
              {sp}
            </option>
          ))}
        </select>
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
        {/* search-page facet anatomy — real labeled dropdowns, not filter chips */}
        <span className="plan-filters facet-row">
          <label className="facet">
            <span>type</span>
            <select
              aria-label="Type filter"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
            >
              <option value="all">All</option>
              <option value="task">Task</option>
              <option value="handoff">Handoff</option>
            </select>
          </label>
          <label className="facet">
            <span>project</span>
            <select
              aria-label="Project filter"
              value={projectFilter}
              onChange={(e) => setProjectFilter(e.target.value)}
            >
              <option value="all">All</option>
              {projects.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
            </select>
          </label>
        </span>
        <Button variant="primary" onClick={() => useHandoffs.getState().openCompose()}>
          ＋ New item
        </Button>
      </div>
      {error && <div className="note-error">{error}</div>}

      {tab === 'board' && (
        <div className="plan-board">
          {COLUMNS.map(({ key, label }) => (
            <section
              key={key}
              className={`plan-col${dropCol === key ? ' is-drop-ok' : ''}`}
              aria-label={label}
              onDragOver={(e) => {
                if (draggingItem && dropAction(draggingItem, key)) {
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dropCol !== key) setDropCol(key)
                }
              }}
              onDragLeave={(e) => {
                if (!e.currentTarget.contains(e.relatedTarget as Node) && dropCol === key)
                  setDropCol(null)
              }}
              onDrop={(e) => {
                e.preventDefault()
                performDrop(key)
              }}
            >
              <div className="plan-col-head">
                <span className="plan-col-label">{label}</span>
                <span className="plan-col-count">{cols[key].length}</span>
              </div>
              {cols[key].length === 0 ? (
                <div className="plan-col-empty">—</div>
              ) : (
                cols[key]
                  .slice(0, key === 'done' ? 4 : 50)
                  .map((item) => <PlanCard key={`${item.kind}/${item.id}`} item={item} />)
              )}
              {key === 'done' && cols.done.length > 4 && (
                <div className="plan-col-empty">＋ {cols.done.length - 4} more</div>
              )}
            </section>
          ))}
        </div>
      )}

      {tab === 'backlog' && (
        <div className="plan-backlog">
          <div className="plan-col-head">
            <span className="plan-col-label">BACKLOG · SNOOZED</span>
            <span className="plan-col-count">{backlog.length}</span>
          </div>
          {backlog.length === 0 ? (
            <div className="ops-clear">Nothing parked — the backlog is clear.</div>
          ) : (
            backlog.map((item) => <PlanCard key={`${item.kind}/${item.id}`} item={item} />)
          )}
        </div>
      )}

      {tab === 'sprints' && (
        <div className="plan-backlog">
          {sprints.length === 0 ? (
            <div className="empty-state" style={{ border: 'none' }}>
              <p>No sprints yet — set `sprint:` on work items (work_update) and they group here.</p>
              <Button onClick={() => setTab('board')}>Back to Board</Button>
            </div>
          ) : (
            sprints.map((sp) => {
              const inSprint = filtered.filter((i) => i.sprint === sp)
              const done = inSprint.filter(
                (i) => i.status === 'done' || i.status === 'consumed',
              ).length
              return (
                <section key={sp} aria-label={`Sprint ${sp}`} className="plan-sprint">
                  <div className="plan-col-head">
                    <span className="plan-col-label">{sp}</span>
                    <span className="plan-col-count">
                      {done}/{inSprint.length} done
                    </span>
                  </div>
                  {inSprint.map((item) => (
                    <PlanCard key={`${item.kind}/${item.id}`} item={item} />
                  ))}
                </section>
              )
            })
          )}
        </div>
      )}

      <div className="plan-foot">
        drag a card = status transition (decline/snooze stay buttons — they need words) · every
        move is an attributed git commit · handoffs and tasks share the pipeline
      </div>
    </div>
  )
}
