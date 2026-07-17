/**
 * Atlas Project lens (v3 parity slice I — reference 18): ← Map header with
 * tint dot · name · mono stats · Deep dive ▸, then three columns —
 * RECEIVES (inbound handoff cards, open amber / consumed dimmed) ·
 * TOPICS · NEWEST FIRST (numbered rows that expand to the WP1 note cards —
 * every card kept, §5.1) · SENDS (outbound cards with trace thread ▸).
 * Pure data still comes from buildProjectPage; this file is presentation +
 * navigation glue only.
 */
import { useState } from 'react'
import type { AtlasGraph, HandoffCard } from '../../../../shared/types'
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import type { RelationshipChip } from '../../../../shared/atlas-relationships'
import { sectionTint } from '../reader/sectionTint'
import { buildProjectPage, type ProjectPageNote } from './project-page'

/** today / Nd ago / Non date → the header's last-activity line. */
function relativeDate(iso: string | null): string {
  if (!iso) return ''
  const then = Date.parse(iso)
  if (Number.isNaN(then)) return iso
  const days = Math.floor((Date.now() - then) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  return `${days}d ago`
}

function openNote(path: string): void {
  if (!path) return
  useApp.getState().setView('reader')
  void useReader.getState().open(path)
}

function openBoard(project: string): void {
  useHandoffs.getState().setProject(project)
  useApp.getState().setView('handoffs')
}

const LANE_TONE: Record<string, string> = {
  open: 'is-warn',
  accepted: 'is-ok',
  snoozed: 'is-mut',
  declined: 'is-mut',
  consumed: 'is-mut',
}

/** One lane card (reference 18): caps status chip · from/to · objective. */
function LaneCard({
  card,
  lane,
  project,
  onTrace,
}: {
  card: HandoffCard
  lane: 'in' | 'out'
  project: string
  onTrace?: () => void
}): React.JSX.Element {
  const done = card.status === 'consumed' || card.status === 'declined'
  const other = lane === 'in' ? card.from : card.to
  return (
    <div
      className={`lens-card${done ? ' is-done' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => openBoard(project)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && e.target === e.currentTarget) openBoard(project)
      }}
    >
      <div className="lens-card-head">
        <span className={`lens-status ${LANE_TONE[card.status] ?? 'is-mut'}`}>
          {card.status === 'open' ? '● OPEN' : card.status.toUpperCase()}
        </span>
        <span className="lens-card-meta">
          {lane === 'in' ? 'from' : 'to'} {other}
          {card.status === 'open' && card.ageDays > 0 ? ` · ${card.ageDays}d` : ''}
        </span>
      </div>
      <div className="lens-card-title">{card.objective || card.name}</div>
      {onTrace && (
        <button
          type="button"
          className="lens-trace"
          onClick={(e) => {
            e.stopPropagation()
            onTrace()
          }}
        >
          trace thread ▸
        </button>
      )}
    </div>
  )
}

export function ProjectPage({ graph }: { graph: AtlasGraph }): React.JSX.Element {
  const page = buildProjectPage(graph)
  const { header, attention, flows, topics, handoffs } = page
  const drillProject = useAtlas((s) => s.drillProject)
  const navigate = useAtlas((s) => s.navigate)
  const setPanel = useAtlas((s) => s.setPanel)
  const [openTopic, setOpenTopic] = useState<string | null>(null)

  const hasFlows = flows.inbound.length > 0 || flows.outbound.length > 0
  const empty = topics.length === 0 && handoffs.length === 0
  const receives = handoffs.filter((c) => c.to === header.project)
  const sends = handoffs.filter((c) => c.from === header.project)
  const trace = (): void => {
    // WP4 (spec §Navigation glue): Deep Dive scoped to this project + Path armed
    void navigate('deep', { project: header.project })
    setPanel('path')
  }

  return (
    <div className="project-page lens">
      <div className="lens-head">
        <button type="button" className="lens-back" onClick={() => void navigate('overview', {})}>
          ← Map
        </button>
        <span
          className="lens-dot"
          style={{ background: sectionTint(header.project) }}
          aria-hidden="true"
        />
        <span className="lens-name">{header.project}</span>
        <span className="lens-stats">
          {header.noteCount === 1 ? '1 note' : `${header.noteCount} notes`}
          {attention.open > 0 ? ` · ${attention.open} open in` : ''}
          {attention.blocked > 0 ? ` · ${attention.blocked} blocked` : ''}
          {header.lastActivity ? ` · ${relativeDate(header.lastActivity)}` : ''}
        </span>
        {header.briefPath && (
          <button
            type="button"
            className={`pp-brief-chip pp-brief-${header.briefFreshness}`}
            title="Open the project brief in the reader"
            onClick={() => openNote(header.briefPath as string)}
          >
            brief {header.briefFreshness}
          </button>
        )}
        <button
          type="button"
          className="button-secondary lens-deep pp-trace"
          title="Open the Deep Dive graph scoped to this project to trace how work and knowledge connect"
          onClick={trace}
        >
          Deep dive ▸
        </button>
      </div>

      {empty && (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Nothing filed for {header.project} yet — notes and handoffs land here as work flows.</p>
        </div>
      )}

      {!empty && (
        <div className="lens-cols">
          <div className="lens-col">
            <div className="rail-label">RECEIVES</div>
            {receives.length === 0 ? (
              <div className="rail-empty">—</div>
            ) : (
              receives.map((card) => (
                <LaneCard key={card.id} card={card} lane="in" project={header.project} />
              ))
            )}
            {hasFlows && flows.inbound.length > 0 && (
              <div className="lens-flows">
                {flows.inbound.map((chip) => (
                  <FlowChip key={`in:${chip.nodeId}`} chip={chip} onPick={drillProject} />
                ))}
              </div>
            )}
          </div>

          <div className="lens-col lens-col-topics">
            <div className="rail-label">TOPICS · NEWEST FIRST</div>
            {topics.map((topic, i) => (
              <section className="pp-topic" key={topic.topic}>
                <button
                  type="button"
                  className="lens-topic"
                  aria-expanded={openTopic === topic.topic}
                  onClick={() => setOpenTopic(openTopic === topic.topic ? null : topic.topic)}
                >
                  <span className="lens-topic-num">{String(i + 1).padStart(2, '0')}</span>
                  <span className="lens-topic-name">{topic.topic}</span>
                  <span className="lens-topic-meta">
                    {topic.count === 1 ? '1 note' : `${topic.count} notes`}
                    {topic.newestDate ? ` · ${topic.newestDate.slice(5)}` : ''}
                  </span>
                </button>
                {openTopic === topic.topic && (
                  <div className="pp-note-grid">
                    {topic.notes.map((note) => (
                      <NoteCard key={note.id} note={note} />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>

          {handoffs.length > 0 && (
            <div className="lens-col">
              <div className="rail-label">SENDS</div>
              {sends.length === 0 ? (
                <div className="rail-empty">—</div>
              ) : (
                sends.map((card) => (
                  <LaneCard
                    key={card.id}
                    card={card}
                    lane="out"
                    project={header.project}
                    onTrace={trace}
                  />
                ))
              )}
              {hasFlows && flows.outbound.length > 0 && (
                <div className="lens-flows">
                  {flows.outbound.map((chip) => (
                    <FlowChip key={`out:${chip.nodeId}`} chip={chip} onPick={drillProject} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** One note card: humanized serif title, type/topic chips, excerpt, date. */
function NoteCard({ note }: { note: ProjectPageNote }): React.JSX.Element {
  return (
    // biome-ignore lint: the card is a button — full keyboard path below
    <div
      className={`pp-note${note.stale ? ' pp-note-stale' : ''}`}
      role="button"
      tabIndex={0}
      title={note.name}
      onClick={() => openNote(note.path)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openNote(note.path)
        }
      }}
    >
      <h3 className="pp-note-title">{note.title}</h3>
      <div className="pp-note-chips">
        <span className="pp-chip pp-chip-type">{note.noteType}</span>
        {note.topic && <span className="pp-chip pp-chip-topic">{note.topic}</span>}
      </div>
      {note.excerpt && <p className="pp-note-excerpt">{note.excerpt}</p>}
      <div className={`pp-note-date${note.stale ? ' pp-note-date-stale' : ''}`}>
        {note.date}
        {note.stale ? ' · stale' : ''}
      </div>
    </div>
  )
}

/** Flows-with chip: `<project> (N)`, gold count when the lane has open handoffs,
 *  clicking opens that project's lens. Mirrors the atlas relationship strip. */
function FlowChip({
  chip,
  onPick,
}: {
  chip: RelationshipChip
  onPick: (project: string) => void
}): React.JSX.Element {
  const open = chip.open > 0
  return (
    <button
      type="button"
      className={`atlas-rel-chip${chip.blocking ? ' atlas-rel-chip-blocking' : ''}`}
      title={`${chip.total} handoff${chip.total === 1 ? '' : 's'} with ${chip.project}${
        open ? ` · ${chip.open} still open` : ''
      } — open ${chip.project}`}
      onClick={() => onPick(chip.project)}
    >
      <span className="atlas-rel-name">{chip.project}</span>
      <span className={`atlas-rel-count${open ? ' atlas-rel-count-open' : ''}`}>{chip.total}</span>
    </button>
  )
}
