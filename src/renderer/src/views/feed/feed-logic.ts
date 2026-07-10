/** Pure feed view logic (story 6.2): day grouping, avatars, navigation targets. */
import type { ActivityEvent } from '../../../../shared/types'

export interface DayGroup {
  /** ISO day key (event.at.slice(0, 10) — the lib's documented grouping key) */
  day: string
  events: ActivityEvent[]
}

/** Group chronologically-ordered events under day headers (input order kept). */
export function groupByDay(events: ActivityEvent[]): DayGroup[] {
  const groups: DayGroup[] = []
  for (const event of events) {
    const day = event.at.slice(0, 10)
    const last = groups[groups.length - 1]
    if (last && last.day === day) last.events.push(event)
    else groups.push({ day, events: [event] })
  }
  return groups
}

export function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today'
  const y = new Date(`${today}T00:00:00Z`)
  y.setUTCDate(y.getUTCDate() - 1)
  if (day === y.toISOString().slice(0, 10)) return 'Yesterday'
  return day
}

/** Deterministic initials from an actor name: first letters of first two words. */
export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  if (words.length === 0) return '?'
  const first = words[0]?.[0] ?? '?'
  const second = words.length > 1 ? (words[words.length - 1]?.[0] ?? '') : ''
  return (first + second).toUpperCase()
}

/**
 * Defect 14.2-2: one commit = one event row, however many parse passes ran.
 * Keeps the first (newest-parse) event per commit hash, input order preserved.
 */
export function dedupeBySha(events: ActivityEvent[]): ActivityEvent[] {
  const seen = new Set<string>()
  return events.filter((event) => {
    if (seen.has(event.sha)) return false
    seen.add(event.sha)
    return true
  })
}

/** Dense row text: note basename; the full path lives in the hover title. */
export function noteBasename(path: string): string {
  return path.split('/').pop() ?? path
}

export type FeedTarget = { kind: 'board' } | { kind: 'note'; path: string } | { kind: 'sync' }

/**
 * Click navigation: handoff subjects go to the board, note subjects to the
 * reader, plain sync events to the sync panel.
 */
export function targetOf(event: ActivityEvent): FeedTarget {
  if (event.subject.handoffId) return { kind: 'board' }
  if (event.subject.path) return { kind: 'note', path: event.subject.path }
  return { kind: 'sync' }
}
