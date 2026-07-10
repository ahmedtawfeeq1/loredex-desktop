/**
 * Pure lifecycle-form logic (story 8.1): snooze-date arithmetic + validation.
 * Dates are vault-format `YYYY-MM-DD` strings, local time (the lib compares
 * snoozed_until against the local calendar day the same way).
 */

/** Local calendar day as YYYY-MM-DD. */
export function localDay(now: Date = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** `day` + n days, same format. */
export function addDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const date = new Date(y as number, (m as number) - 1, (d as number) + n)
  return localDay(date)
}

/** Snoozing needs a future date: min is tomorrow (AC2). */
export function minSnoozeDate(today: string): string {
  return addDays(today, 1)
}

/** null when `until` is a valid snooze date, else the problem. */
export function snoozeProblem(until: string, today: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(until)) return 'Pick a date (YYYY-MM-DD).'
  if (until < minSnoozeDate(today)) return 'Snooze until tomorrow at the earliest.'
  return null
}

/** Quick options for the picker: tomorrow / next week (AC2). */
export function snoozeQuickOptions(today: string): Array<{ label: string; until: string }> {
  return [
    { label: 'Tomorrow', until: addDays(today, 1) },
    { label: 'Next week', until: addDays(today, 7) },
  ]
}

/**
 * Prior-attribution history lines for the detail view (story 8.1 dev note):
 * transitions never erase attribution fields (except snooze fields on reopen),
 * so the frontmatter IS the history — rendered muted, in lifecycle order.
 */
export function attributionLines(meta: Record<string, unknown>): string[] {
  const day = (v: unknown): string => String(v ?? '').slice(0, 10)
  const lines: string[] = []
  if (meta.accepted_by) lines.push(`accepted by ${meta.accepted_by} · ${day(meta.accepted_at)}`)
  if (meta.declined_by) {
    const reason = meta.declined_reason ? ` — “${meta.declined_reason}”` : ''
    lines.push(`declined by ${meta.declined_by} · ${day(meta.declined_at)}${reason}`)
  }
  if (meta.snoozed_by) {
    const until = meta.snoozed_until ? ` until ${day(meta.snoozed_until)}` : ''
    lines.push(`snoozed by ${meta.snoozed_by} · ${day(meta.snoozed_at)}${until}`)
  }
  if (meta.consumed_by) lines.push(`consumed by ${meta.consumed_by} · ${day(meta.consumed_at)}`)
  return lines
}
