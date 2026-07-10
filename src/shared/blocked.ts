/**
 * The ONE blocking rule (stories 10.1/10.6, architecture-m2 §1 lifecycle):
 * open/accepted `kind: request` handoffs block their route; an expired snooze
 * derives as open (never auto-written). Shared so the core atlas model and
 * the renderer's blocked-on list can never disagree.
 */
import { toVaultRelative } from './handoff-lanes'
import type { HandoffCard } from './types'

export function isBlockingCard(
  card: Pick<HandoffCard, 'kind' | 'status' | 'expired'>,
): boolean {
  if (card.kind !== 'request') return false
  return card.status === 'open' || card.status === 'accepted' || card.expired
}

/** One row of the blocked-on side list (story 10.6 AC4). */
export interface BlockedRow {
  id: string
  /** vault-relative path — resolves to the handoff board card (§3 table) */
  relPath: string
  from: string
  to: string
  date: string
  objective: string
  /** the PM sentence, verbatim per the AC */
  sentence: string
}

/** Blocking handoffs OLDEST-FIRST — age is the point of the blocked question. */
export function blockedRows(cards: HandoffCard[], vaultPath: string): BlockedRow[] {
  return cards
    .filter(isBlockingCard)
    .sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id))
    .map((c) => ({
      id: c.id,
      relPath: toVaultRelative(c.path, vaultPath),
      from: c.from,
      to: c.to,
      date: c.date,
      objective: c.objective || c.name,
      sentence: `${c.to} is blocked on ${c.from}`,
    }))
}
