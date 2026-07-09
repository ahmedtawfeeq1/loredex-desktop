/**
 * Notification + badge decisions (story 3.7). Business logic lives HERE in
 * the core host; main only displays what it is told (architecture rule:
 * core decides, main displays).
 *
 * v0.1 scope cuts applied: no poller — the check runs on every refresh action
 * (handoffs.list / vault.tree); notification log is in-memory (app.db is
 * story 3.6); snoozes arrive with the app.db store.
 */
import { toVaultRelative } from '../shared/handoff-lanes'
import type { CoreEvent, MainControlMessage } from '../shared/ipc-contract'
import type { HandoffCard } from '../shared/types'

export interface HandoffNotification {
  title: string
  body: string
  /** vault-relative note path; '' on a batched summary (click opens the board) */
  relPath: string
}

export interface NotifyDecision {
  /** dock badge: open INBOUND handoffs only (Things discipline) */
  badge: number
  /** cards that became open since the last check — handoff.new events */
  newOpen: HandoffCard[]
  notifications: HandoffNotification[]
}

/** N>3 new handoffs collapse into one summary — never a storm (AC4). */
export const BATCH_THRESHOLD = 3

/**
 * Inbound = addressed to one of "my projects" (registered in config). A vault
 * opened via the picker registers none — then every project is mine and the
 * whole vault's open handoffs count.
 */
export function openInbound(cards: HandoffCard[], myProjects: string[]): HandoffCard[] {
  return cards.filter(
    (c) => c.status === 'open' && (myProjects.length === 0 || myProjects.includes(c.to)),
  )
}

export function decideNotifications(
  seen: ReadonlySet<string> | null,
  cards: HandoffCard[],
  myProjects: string[],
  vaultPath: string,
): NotifyDecision {
  const inbound = openInbound(cards, myProjects)
  const badge = inbound.length
  // first snapshot (app start / vault switch): set the badge, never a storm
  const newOpen = seen === null ? [] : inbound.filter((c) => !seen.has(c.id))

  let notifications: HandoffNotification[]
  if (newOpen.length > BATCH_THRESHOLD) {
    const projects = [...new Set(newOpen.map((c) => c.to))].sort().join(', ')
    notifications = [
      {
        title: 'New handoffs',
        body: `${newOpen.length} new handoffs for ${projects}`,
        relPath: '',
      },
    ]
  } else {
    notifications = newOpen.map((c) => ({
      title: `New handoff for ${c.to}`,
      body: `${c.from} ⟶ ${c.to} — ${c.objective || c.name}`,
      relPath: toVaultRelative(c.path, vaultPath),
    }))
  }
  return { badge, newOpen, notifications }
}

export interface NotificationLogEntry {
  at: string
  kind: 'handoff.new' | 'summary'
  id: string
}

export interface HandoffNotifier {
  /** run the check: list, diff, badge, notify, emit. Returns the fresh cards. */
  refresh(): HandoffCard[]
  /** in-memory until story 3.6 moves it to app.db */
  readonly log: NotificationLogEntry[]
}

export function createHandoffNotifier(deps: {
  listAll(): HandoffCard[]
  myProjects(): string[]
  vaultPath(): string
  post(msg: MainControlMessage): void
  emit(event: CoreEvent): void
}): HandoffNotifier {
  let seen: Set<string> | null = null
  const log: NotificationLogEntry[] = []

  return {
    log,
    refresh() {
      let cards: HandoffCard[]
      let myProjects: string[]
      let vaultPath: string
      try {
        cards = deps.listAll()
        myProjects = deps.myProjects()
        vaultPath = deps.vaultPath()
      } catch {
        return [] // no config yet (vault picker pending) — nothing to decide
      }
      const decision = decideNotifications(seen, cards, myProjects, vaultPath)
      // dedupe forever within this host lifetime; consumed ids stay seen
      seen = new Set([...(seen ?? []), ...openInbound(cards, myProjects).map((c) => c.id)])
      deps.post({ t: 'badge', count: decision.badge })
      const at = new Date().toISOString()
      for (const n of decision.notifications) {
        deps.post({ t: 'notify', ...n })
        if (n.relPath === '') log.push({ at, kind: 'summary', id: `summary:${decision.newOpen.length}` })
      }
      for (const card of decision.newOpen) {
        deps.emit({ kind: 'handoff.new', handoff: card })
        log.push({ at, kind: 'handoff.new', id: card.id })
      }
      return cards
    },
  }
}
