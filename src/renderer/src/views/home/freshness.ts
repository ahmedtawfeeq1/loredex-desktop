/** Brief freshness badge logic (story 2.5, AC3) — pure, unit-testable. */

export interface Freshness {
  label: string
  /** fresh = quiet, aging = amber attention, stale = rust */
  tone: 'fresh' | 'aging' | 'stale'
}

export const AGING_AFTER_DAYS = 1
export const STALE_AFTER_DAYS = 7

export function formatFreshness(mtimeIso: string | null, now: Date = new Date()): Freshness {
  if (!mtimeIso) return { label: 'rendered live — no curated brief yet', tone: 'aging' }
  const ms = now.getTime() - new Date(mtimeIso).getTime()
  const days = Math.floor(ms / 86_400_000)
  if (days < AGING_AFTER_DAYS) return { label: 'curated today', tone: 'fresh' }
  const label = `curated ${days}d ago`
  return { label, tone: days >= STALE_AFTER_DAYS ? 'stale' : 'aging' }
}
