/**
 * Atlas reframe WP1 — the readable project PAGE (spec §Learn). Replaces the
 * Learn SVG graph with a full-width, scrollable HTML document for one project:
 * a serif header + counts, an attention line, a flows-with strip, one section
 * per topic (note cards → Reader), a handoffs section (HandoffCardView → board)
 * and a "Trace connections →" affordance into Deep Dive. Pure data comes from
 * buildProjectPage; this file is presentation + navigation glue only. DESIGN v2.
 */
import type { AtlasGraph, HandoffCard } from '../../../../shared/types'
import { HandoffCardView } from '../../components/HandoffCardView'
import { useApp } from '../../stores/app'
import { useAtlas } from '../../stores/atlas'
import { useHandoffs } from '../../stores/handoffs'
import { useReader } from '../../stores/reader'
import type { RelationshipChip } from '../../../../shared/atlas-relationships'
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

export function ProjectPage({ graph }: { graph: AtlasGraph }): React.JSX.Element {
  const page = buildProjectPage(graph)
  const { header, attention, flows, topics, handoffs } = page
  const drillProject = useAtlas((s) => s.drillProject)
  const navigate = useAtlas((s) => s.navigate)

  const hasFlows = flows.inbound.length > 0 || flows.outbound.length > 0
  const empty = topics.length === 0 && handoffs.length === 0

  return (
    <div className="project-page">
      <header className="pp-header">
        <h1 className="pp-title">{header.project}</h1>
        <div className="pp-meta">
          <span className="pp-counts">
            {header.noteCount === 1 ? '1 note' : `${header.noteCount} notes`}
            {' · '}
            {header.openCount === 1 ? '1 open handoff' : `${header.openCount} open handoffs`}
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
          {header.lastActivity && (
            <span className="pp-last" title={header.lastActivity}>
              last activity {relativeDate(header.lastActivity)}
            </span>
          )}
        </div>
      </header>

      {(attention.open > 0 || attention.blocked > 0) && (
        <div className="pp-attention">
          {attention.open > 0 && (
            <button
              type="button"
              className="pp-attention-link"
              onClick={() => openBoard(header.project)}
            >
              {attention.open} open {attention.open === 1 ? 'handoff' : 'handoffs'} →
            </button>
          )}
          {attention.blocked > 0 && (
            <button
              type="button"
              className="pp-attention-link pp-attention-blocked"
              onClick={() => openBoard(header.project)}
            >
              {attention.blocked} blocked →
            </button>
          )}
        </div>
      )}

      {hasFlows && (
        <div className="pp-flows" aria-label="Handoff flow with other projects">
          {flows.inbound.length > 0 && (
            <div className="pp-flow-group">
              <span className="pp-flow-label">Receives from</span>
              {flows.inbound.map((chip) => (
                <FlowChip key={`in:${chip.nodeId}`} chip={chip} onPick={drillProject} />
              ))}
            </div>
          )}
          {flows.outbound.length > 0 && (
            <div className="pp-flow-group">
              <span className="pp-flow-label">Sends to</span>
              {flows.outbound.map((chip) => (
                <FlowChip key={`out:${chip.nodeId}`} chip={chip} onPick={drillProject} />
              ))}
            </div>
          )}
        </div>
      )}

      {empty && (
        <div className="empty-state" style={{ border: 'none' }}>
          <p>Nothing filed in {header.project} yet — notes and handoffs land here as work flows.</p>
        </div>
      )}

      {topics.map((topic) => (
        <section className="pp-topic" key={topic.topic}>
          <h2 className="pp-topic-head">
            <span className="pp-topic-name">{topic.topic}</span>
            <span className="pp-topic-meta">
              {topic.count === 1 ? '1 note' : `${topic.count} notes`}
              {topic.newestDate ? ` · ${topic.newestDate}` : ''}
            </span>
          </h2>
          <div className="pp-note-grid">
            {topic.notes.map((note) => (
              <NoteCard key={note.id} note={note} />
            ))}
          </div>
        </section>
      ))}

      {handoffs.length > 0 && (
        <section className="pp-topic pp-handoffs">
          <h2 className="pp-topic-head">
            <span className="pp-topic-name">handoffs</span>
            <span className="pp-topic-meta">
              {handoffs.length === 1 ? '1 handoff' : `${handoffs.length} handoffs`}
            </span>
          </h2>
          <div className="pp-handoff-grid">
            {handoffs.map((card: HandoffCard) => (
              <HandoffCardView key={card.id} card={card} onOpen={() => openBoard(header.project)} />
            ))}
          </div>
        </section>
      )}

      <div className="pp-trace-row">
        <button
          type="button"
          className="button-secondary pp-trace"
          title="Open the Deep Dive graph scoped to this project to trace how work and knowledge connect"
          onClick={() => void navigate('deep', { project: header.project })}
        >
          Trace connections →
        </button>
      </div>
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
 *  clicking opens that project's Learn page. Mirrors the atlas relationship
 *  strip chip vocabulary (reused class names). */
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
