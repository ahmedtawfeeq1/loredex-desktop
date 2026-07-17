/**
 * Plan (v3 parity slice E — reference 03): Board · Backlog · Sprints over
 * the lib's REAL work-item plane (loredex ≥ 2.8, `work.list`). Columns:
 *   TRIAGE (open handoffs/requests — human triage A/D/S) · TODO (tasks) ·
 *   IN PROGRESS (doing) · REVIEW · DONE·CONSUMED (dimmed).
 * Cards carry the reference anatomy: caps kind chip + mono id → title →
 * project dot · P? · S? · actions. Handoff transitions ride the handoffs
 * store (8.1 machine); task moves ride the one work writer. Deviations from
 * reference (Dev Agent Record): no drag-and-drop (decline needs a reason,
 * snooze a date — a drop can't collect either; chips do the moves), and
 * "＋ New item" opens the compose modal (handoff/request) because the lib
 * has no createWorkItem yet — task notes are agent-authored today.
 */
import { useEffect, useMemo, useState } from 'react'
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
        <span className="plan-filters">
          <select
            className="plan-filter"
            aria-label="Type filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as typeof typeFilter)}
          >
            <option value="all">type: all</option>
            <option value="task">type: task</option>
            <option value="handoff">type: handoff</option>
          </select>
          <span className="plan-filter-sep">·</span>
          <select
            className="plan-filter"
            aria-label="Project filter"
            value={projectFilter}
            onChange={(e) => setProjectFilter(e.target.value)}
          >
            <option value="all">project: all</option>
            {projects.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </span>
        <Button variant="primary" onClick={() => useHandoffs.getState().openCompose()}>
          ＋ New item
        </Button>
      </div>
      {error && <div className="note-error">{error}</div>}

      {tab === 'board' && (
        <div className="plan-board">
          {COLUMNS.map(({ key, label }) => (
            <section key={key} className="plan-col" aria-label={label}>
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
        status moves are attributed git commits · handoffs and tasks share the pipeline · board
        reads the lib work-item plane
      </div>
    </div>
  )
}
