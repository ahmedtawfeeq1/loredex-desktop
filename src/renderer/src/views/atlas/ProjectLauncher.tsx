/**
 * Atlas reframe WP2 — the Overview project LAUNCHER (spec §Overview). Overview's
 * default is no longer the SVG graph but a readable, keyboard-reachable card
 * grid of the vault's projects, reusing the Home project-health card style
 * (ops-health CSS). Each card shows name + tint dot, N notes · M open, the
 * in/out open-flow badges, brief freshness and last activity; clicking (or
 * Enter/Space) opens that project's Learn page. The graph topology stays one
 * "Flow view" toggle away (AtlasView). Data is the same dashboard.build +
 * handoffs.list Home already loads — no new backend, no re-fetch of its own.
 */
import { useEffect } from 'react'
import { useAtlas } from '../../stores/atlas'
import { useDashboardData } from '../home/dashboard-data'
import { useHandoffs } from '../../stores/handoffs'
import { sectionTint } from '../reader/sectionTint'
import { buildLauncherCards, type LauncherCard } from './launcher-cards'
import '../home/home.css'

export function ProjectLauncher(): React.JSX.Element {
  const dash = useDashboardData((s) => s.dash)
  const loadDash = useDashboardData((s) => s.load)
  const cards = useHandoffs((s) => s.cards)
  const navigate = useAtlas((s) => s.navigate)

  // the launcher rides the same live-recomputing stores Home does; load once
  // when this is the first view to need them (watcher/poller keeps them fresh)
  useEffect(() => {
    if (!dash) void loadDash()
  }, [dash, loadDash])
  useEffect(() => {
    if (cards === null) void useHandoffs.getState().load()
  }, [cards])

  const launcherCards = buildLauncherCards(dash?.states ?? [], cards ?? [])

  if (dash === null) {
    return (
      <div className="atlas-loading" aria-label="Loading the project launcher">
        <div className="atlas-loading-card" />
        <div className="atlas-loading-card" />
        <div className="atlas-loading-card" />
      </div>
    )
  }

  if (launcherCards.length === 0) {
    return (
      <div className="empty-state" style={{ border: 'none' }}>
        <p>No projects yet — the launcher fills as agents route notes and hand off work.</p>
      </div>
    )
  }

  return (
    <div className="atlas-launcher">
      <div className="atlas-launcher-grid ops-health-grid-wide">
        {launcherCards.map((card) => (
          <LauncherCardView
            key={card.project}
            card={card}
            onOpen={() => void navigate('learn', { project: card.project })}
          />
        ))}
      </div>
    </div>
  )
}

/** One project card — Home ops-health markup, click/Enter → the Learn page. */
function LauncherCardView({
  card,
  onOpen,
}: {
  card: LauncherCard
  onOpen: () => void
}): React.JSX.Element {
  return (
    <div
      className="ops-health ops-row-link"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen()
        }
      }}
      title={`Open ${card.project}`}
    >
      <div className="ops-health-head">
        <span
          className="ops-dot"
          style={{ background: sectionTint(card.project) }}
          aria-hidden="true"
        />
        <span className="ops-health-name" title={card.project}>
          {card.project}
        </span>
        {card.lastDate && <span className="ops-mini ops-health-date">{card.lastDate}</span>}
      </div>
      <div className="ops-mini atlas-launcher-counts">
        {card.noteCount} {card.noteCount === 1 ? 'note' : 'notes'} · {card.open} open
      </div>
      <div className="ops-health-chips">
        {card.openIn > 0 && <span className="ops-chip">{card.openIn} in</span>}
        {card.openOut > 0 && <span className="ops-chip">{card.openOut} out</span>}
        {card.brief === 'stale' ? (
          <span className="ops-chip chip-rust">brief stale</span>
        ) : card.brief === 'none' ? (
          <span className="ops-chip">no brief</span>
        ) : (
          <span className="ops-chip chip-ok">brief fresh</span>
        )}
      </div>
    </div>
  )
}
