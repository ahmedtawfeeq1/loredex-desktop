/**
 * THE seam between renderer and core host (architecture.md#ipc-contract).
 * Story 1.1 lays down the wire envelope + ping; Story 1.2 adds the full
 * CoreApi map and CoreEvent union.
 */

/** Raw messages that travel over the brokered MessagePort. */
export type WireMessage = { t: 'ping' } | { t: 'pong' }

export function isWireMessage(v: unknown): v is WireMessage {
  return (
    typeof v === 'object' &&
    v !== null &&
    't' in v &&
    ((v as { t: unknown }).t === 'ping' || (v as { t: unknown }).t === 'pong')
  )
}
