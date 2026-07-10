/**
 * snooze_timers (story 9.2 / epic3.story6): a LOCAL mirror of vault
 * `snoozed_until` so expiry fires a toast ONCE per machine (`notified` flag).
 * The vault is authoritative — expiry never auto-writes status; timers
 * reconcile from frontmatter on every board load and post-integrate.
 */
import type { AppDb } from './index'

/** The card slice the timer mirror needs (lib HandoffCard is a superset). */
export interface SnoozeSource {
  id: string
  status: string
  snoozedUntil?: string | undefined
}

/**
 * Frontmatter → timers, full reconcile: upsert a row per snoozed card (a
 * changed `until` re-arms `notified`), drop rows whose card is no longer
 * snoozed (reopened/accepted/consumed — the toast must be able to fire again
 * on a future snooze).
 */
export function reconcileSnoozeTimers(db: AppDb, vaultId: string, cards: SnoozeSource[]): void {
  const upsert = db.prepare(
    `INSERT INTO snooze_timers (vault_id, handoff_id, until, notified) VALUES (?, ?, ?, 0)
     ON CONFLICT(vault_id, handoff_id) DO UPDATE SET
       notified = CASE WHEN snooze_timers.until = excluded.until THEN snooze_timers.notified ELSE 0 END,
       until = excluded.until`,
  )
  const del = db.prepare('DELETE FROM snooze_timers WHERE vault_id = ? AND handoff_id = ?')
  const existing = db
    .prepare('SELECT handoff_id FROM snooze_timers WHERE vault_id = ?')
    .all(vaultId) as Array<{ handoff_id: string }>
  db.transaction(() => {
    const snoozed = new Set<string>()
    for (const card of cards) {
      if (card.status === 'snoozed' && card.snoozedUntil) {
        snoozed.add(card.id)
        upsert.run(vaultId, card.id, card.snoozedUntil)
      }
    }
    for (const row of existing) {
      if (!snoozed.has(row.handoff_id)) del.run(vaultId, row.handoff_id)
    }
  })()
}

/**
 * Due (`until` < today — same derivation as the lib's expired flag) and not
 * yet notified → flip `notified`, return the ids exactly once per machine.
 * Callers emit `snooze.expired` per id; status stays a human/one-click act.
 */
export function sweepExpiredSnoozes(db: AppDb, vaultId: string, today: string): string[] {
  const due = db
    .prepare(
      'SELECT handoff_id FROM snooze_timers WHERE vault_id = ? AND until < ? AND notified = 0',
    )
    .all(vaultId, today) as Array<{ handoff_id: string }>
  if (due.length === 0) return []
  const flip = db.prepare(
    'UPDATE snooze_timers SET notified = 1 WHERE vault_id = ? AND handoff_id = ?',
  )
  db.transaction(() => {
    for (const row of due) flip.run(vaultId, row.handoff_id)
  })()
  return due.map((row) => row.handoff_id)
}
