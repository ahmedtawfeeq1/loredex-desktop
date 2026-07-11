/**
 * Atlas reframe WP2 — the project LAUNCHER card model (spec §Overview). Overview
 * stops being an SVG graph by default and becomes a readable card grid of the
 * vault's projects. Each card reuses the Home project-health shape (the spec's
 * "reuse the Home project-health card style"): name + tint, N notes · M open,
 * brief freshness, last activity and the in/out open-flow counts. A PURE
 * projection over the dashboard project-state rows + board handoff cards (the
 * data Home already loads and the atlas store never had to re-fetch), so it
 * unit-tests against the nimbus fixture without a DOM. Ranked busiest-flow
 * first, inherited from projectHealth/rankedPulse.
 */
import type { HandoffCard } from '../../../../shared/types'
import { type HealthRow, projectHealth, type ProjectStateRow } from '../home/insights'

export interface LauncherCard {
  /** project name — card title + tint-dot seed (sectionTint) + drill target */
  project: string
  /** notes filed under the project — the "N notes" count */
  noteCount: number
  /** open handoffs touching the project (in or out, due-now) — the "M open" count */
  open: number
  /** open inbound handoffs — the tiny "N in" flow badge */
  openIn: number
  /** open outbound handoffs — the tiny "M out" flow badge */
  openOut: number
  /** the project brief's freshness (none when the project carries no brief) */
  brief: 'fresh' | 'stale' | 'none'
  /** newest activity date ('' when the project has none yet) */
  lastDate: string
}

/**
 * Build the launcher card grid from the dashboard state rows + board handoff
 * cards. Deterministic and DOM-free; the ordering (busiest open-flow first, then
 * biggest project, then name) is projectHealth's, so the cards that need eyes
 * float to the top-left of the grid.
 */
export function buildLauncherCards(
  states: readonly ProjectStateRow[],
  cards: readonly HandoffCard[],
): LauncherCard[] {
  return projectHealth(states, cards).map((r: HealthRow) => ({
    project: r.project,
    noteCount: r.noteCount,
    open: r.openTotal,
    openIn: r.openIn,
    openOut: r.openOut,
    brief: r.brief,
    lastDate: r.lastDate,
  }))
}
