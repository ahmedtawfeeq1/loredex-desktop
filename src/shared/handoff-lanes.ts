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

/**
 * Board display filter (D1 amendment 6): the board opens as a work surface,
 * not a history log. `active` (default) shows what still needs someone —
 * open, accepted, and snoozed (expired snoozes are due again); `done` shows
 * finished work — consumed and declined; `all` shows everything.
 */
export type BoardFilter = 'active' | 'done' | 'all'

const ACTIVE_STATUSES = new Set(['open', 'accepted', 'snoozed'])
const DONE_STATUSES = new Set(['consumed', 'declined'])

/** True when a card belongs in the given display mode. */
export function inDisplay(card: HandoffCard, mode: BoardFilter): boolean {
  if (mode === 'all') return true
  if (mode === 'active') return ACTIVE_STATUSES.has(card.status)
  return DONE_STATUSES.has(card.status)
}

/** Cards visible in the given display mode — applied before laning/grouping. */
export function filterByDisplay(cards: HandoffCard[], mode: BoardFilter): HandoffCard[] {
  return mode === 'all' ? cards : cards.filter((c) => inDisplay(c, mode))
}

/** How many cards the current mode hides (the "N done hidden" affordance). */
export function hiddenCount(cards: HandoffCard[], mode: BoardFilter): number {
  return mode === 'all' ? 0 : cards.length - filterByDisplay(cards, mode).length
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

/** v3 Inbox lanes (story 26.3): For me = inbound to the scoped project(s),
 *  Created = outbound from them, All = both. Pure. */
export type InboxLane = 'forme' | 'created' | 'all'

export function laneCards(
  cards: readonly HandoffCard[],
  lane: InboxLane,
  project: string | 'all',
): HandoffCard[] {
  const toScope = (c: HandoffCard): boolean => project === 'all' || c.to === project
  const fromScope = (c: HandoffCard): boolean => project === 'all' || c.from === project
  if (lane === 'forme') return cards.filter(toScope)
  if (lane === 'created') return cards.filter(fromScope)
  return cards.filter((c) => toScope(c) || fromScope(c))
}

/** Open-inbound count for a project ('all' = whole vault) — nav badge + lane
 *  header. Story 9.3 honesty: expired snoozes are due again and count with
 *  open; snoozed-and-current never count (matches core-side openInbound). */
export function openCount(cards: HandoffCard[], project: string | 'all'): number {
  return cards.filter(
    (c) => (c.status === 'open' || c.expired) && (project === 'all' || c.to === project),
  ).length
}

/**
 * Reverse fulfills edges for board cards (story 8.3 AC3): request id → ids of
 * deliveries naming it. `fulfills` stores the note NAME and card ids are note
 * names (unique per vault — lib uniquePath), so the id match IS the edge; the
 * detail view's rail uses the full resolver. Derived, never a status write.
 */
export function fulfilledByMap(cards: HandoffCard[]): Map<string, string[]> {
  const map = new Map<string, string[]>()
  for (const card of cards) {
    if (!card.fulfills) continue
    const list = map.get(card.fulfills) ?? []
    list.push(card.id)
    map.set(card.fulfills, list)
  }
  return map
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
