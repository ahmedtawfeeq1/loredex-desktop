/**
 * Board data assembly (story 3.2) — pure view logic over lib HandoffCards,
 * shared so core tests exercise exactly what the renderer renders.
 * Direction semantics mirror the lib's HandoffScope: inbound = addressed to
 * the project, outbound = sent by it. No note parsing here, ever.
 */
import type { HandoffCard } from './types'

export interface Lanes {
  inbound: HandoffCard[]
  outbound: HandoffCard[]
}

/** Every project that appears on either end of a handoff, sorted. */
export function projectsOf(cards: HandoffCard[]): string[] {
  const names = new Set<string>()
  for (const card of cards) {
    if (card.from) names.add(card.from)
    if (card.to) names.add(card.to)
  }
  return [...names].sort()
}

/** Both lanes for one project. Cards keep the lib's order (open first, newest first). */
export function lanesFor(cards: HandoffCard[], project: string): Lanes {
  return {
    inbound: cards.filter((c) => c.to === project),
    outbound: cards.filter((c) => c.from === project),
  }
}

/** Company-wide (PM) view: per-project lanes for every project, grouped. */
export function groupByProject(cards: HandoffCard[]): Array<{ project: string; lanes: Lanes }> {
  return projectsOf(cards).map((project) => ({ project, lanes: lanesFor(cards, project) }))
}

/** Open-inbound count for a project ('all' = whole vault) — nav badge + lane header. */
export function openCount(cards: HandoffCard[], project: string | 'all'): number {
  return cards.filter((c) => c.status === 'open' && (project === 'all' || c.to === project))
    .length
}

/** Relative age line: today / 1d / Nd. */
export function formatAge(ageDays: number): string {
  if (ageDays <= 0) return 'today'
  return `${ageDays}d`
}

/** Vault-relative path for the reader (HandoffCard.path is absolute). */
export function toVaultRelative(absPath: string, vaultPath: string): string {
  return absPath.startsWith(`${vaultPath}/`) ? absPath.slice(vaultPath.length + 1) : absPath
}

/**
 * Recipient lifecycle actions a card may offer (story 8.1 AC1) — state-legal
 * only, per the v2 state machine. Lifecycle actions are recipient verbs, so
 * they render on inbound lanes only; legality itself stays lib-enforced (the
 * app merely offers, a race can still make one illegal).
 */
export type HandoffAction = 'accept' | 'decline' | 'snooze' | 'consume' | 'reopen'

export function actionsFor(
  card: Pick<HandoffCard, 'status'>,
  inbound: boolean,
): HandoffAction[] {
  if (!inbound) return []
  switch (card.status) {
    case 'open':
      return ['accept', 'decline', 'snooze']
    case 'accepted':
      return ['consume']
    case 'declined':
    case 'snoozed':
      return ['reopen']
    default:
      return [] // consumed (terminal) and anything unknown: offer nothing
  }
}

/**
 * Qualified handoff id `<project>/<name>` (stories 7.3/8.x): handoff notes live
 * in projects/<to>/handoffs/, so the owning project is the card's `to`. Bare
 * ids are a CLI-human affordance — the app always sends qualified ones so
 * cross-project basename collisions never mis-target.
 */
export function qualifiedId(card: Pick<HandoffCard, 'id' | 'to'>): string {
  return card.to ? `${card.to}/${card.id}` : card.id
}
