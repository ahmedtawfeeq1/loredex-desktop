/**
 * THE seam between renderer and core host — transcribed verbatim from
 * architecture.md#ipc-contract. One generic request/response channel pattern,
 * one push event channel. All payload types live here or in ./types.ts.
 */
import type { Config, Doc, ProductDashboard, SearchHit } from 'loredex'
import type {
  ActivityEvent,
  ConsumeReceipt,
  Facets,
  HandoffCard,
  Identity,
  LinkResolution,
  RoutePreview,
  SyncHealth,
  SyncReport,
  WizardInput,
  WizardResult,
} from './types'

// Payload types that exist in the pinned loredex are imported, never redefined.
export type { Config, Doc, ProductDashboard, SearchHit }

// ── CoreApi map: renderer → core (request/response) ─────────────────────────

export interface CoreApi {
  'config.get': { in: void; out: Config }
  'vault.readNote': { in: { path: string }; out: Doc }
  'vault.search': { in: { q: string; facets?: Facets }; out: SearchHit[] }
  'vault.resolveLink': { in: { link: string; from: string }; out: LinkResolution }
  'handoffs.list': { in: { scope: 'inbox' | 'outbox' | 'all' }; out: HandoffCard[] } // (lib PR-1)
  'handoffs.consume': { in: { id: string; identity: Identity }; out: ConsumeReceipt } // (lib PR-2)
  'route.preview': { in: { file: string }; out: RoutePreview } // (lib PR-3)
  'route.undo': { in: { receiptId: string }; out: void } // (lib PR-3)
  'sync.status': { in: void; out: SyncHealth } // (lib PR-4)
  'sync.run': { in: void; out: SyncReport } // (lib PR-5)
  'dashboard.build': { in: void; out: ProductDashboard }
  'vault.createOrJoin': { in: WizardInput; out: WizardResult }
  'activity.feed': { in: { since?: string }; out: ActivityEvent[] } // (lib PR-6)
}

// ── CoreEvent union: core → renderer (push, one channel) ────────────────────

export type CoreEvent =
  | { kind: 'handoff.new'; handoff: HandoffCard }
  | { kind: 'handoff.stateChanged'; id: string; from: string; to: string; by: Identity }
  | { kind: 'route.completed'; receipt: RoutePreview }
  | { kind: 'vault.changed'; paths: string[] }
  | { kind: 'sync.changed'; health: SyncHealth }
  | { kind: 'git.warning'; text: string } // F8: surface stderr, never swallow

// ── Error envelope ──────────────────────────────────────────────────────────

/**
 * Architecture codes plus transport-level extensions added by this story:
 * INTERNAL (handler threw a non-envelope), TIMEOUT, PORT_SWAPPED (retryable —
 * pending invoke dropped by a core-host respawn), NO_CONFIG (engine has no
 * resolved config yet; story 1.4 adds the picker).
 */
export type IpcCode =
  | 'NOT_IMPLEMENTED'
  | 'VAULT_OUTSIDE_PATH'
  | 'LOCK_BUSY'
  | 'GIT_FAILED'
  | 'PORT_CONFLICT'
  | 'INTERNAL'
  | 'TIMEOUT'
  | 'PORT_SWAPPED'
  | 'NO_CONFIG'

export interface ErrEnvelope {
  code: IpcCode
  message: string
  detail?: unknown
}

export function ipcError(code: IpcCode, message: string, detail?: unknown): ErrEnvelope {
  return detail === undefined ? { code, message } : { code, message, detail }
}

export function isErrEnvelope(v: unknown): v is ErrEnvelope {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as ErrEnvelope).code === 'string' &&
    typeof (v as ErrEnvelope).message === 'string'
  )
}

// ── Wire protocol (what actually crosses the MessagePort) ───────────────────

export type WireRequest = { t: 'req'; id: number; ch: string; arg: unknown }
export type WireResponse =
  | { t: 'res'; id: number; ok: true; out: unknown }
  | { t: 'res'; id: number; ok: false; err: ErrEnvelope }
export type WireEvent = { t: 'evt'; event: CoreEvent }
/** ping/pong is the story-1.1 transport smoke; kept as a liveness check. */
export type WireMessage = { t: 'ping' } | { t: 'pong' } | WireRequest | WireResponse | WireEvent

export function isWireMessage(v: unknown): v is WireMessage {
  if (typeof v !== 'object' || v === null || !('t' in v)) return false
  const t = (v as { t: unknown }).t
  if (t === 'ping' || t === 'pong') return true
  if (t === 'req') {
    const m = v as WireRequest
    return typeof m.id === 'number' && typeof m.ch === 'string'
  }
  if (t === 'res') return typeof (v as WireResponse).id === 'number'
  if (t === 'evt') return typeof (v as WireEvent).event === 'object'
  return false
}

// ── Port abstraction (Electron MessagePortMain / DOM MessagePort / fakes) ───

export interface PortLike {
  postMessage(data: unknown): void
  onMessage(cb: (data: unknown) => void): void
  start?(): void
}

export type Unsubscribe = () => void
