/**
 * THE seam between renderer and core host — transcribed verbatim from
 * architecture.md#ipc-contract. One generic request/response channel pattern,
 * one push event channel. All payload types live here or in ./types.ts.
 */
import type { Config, Doc, ProductDashboard, SearchHit } from 'loredex'
import type { ThemeSetting } from './theme'
import type {
  ActivityEvent,
  AtlasGraph,
  AtlasLevel,
  AtlasPathResult,
  AtlasScope,
  ConsumeReceipt,
  CreateHandoffInput,
  Facets,
  FacetValues,
  HandoffCard,
  HandoffCreateResult,
  HandoffThread,
  HandoffTransition,
  HandshakeStatus,
  HomeBrief,
  Identity,
  IdentitySettings,
  LinkResolution,
  McpStatus,
  ReplyHandoffInput,
  RoutePreview,
  StatusReceipt,
  SyncHealth,
  SyncReport,
  TourDef,
  TreeNode,
  VaultIdentity,
  WizardInput,
  WizardResult,
} from './types'

// Payload types that exist in the pinned loredex are imported, never redefined.
export type { Config, Doc, ProductDashboard, SearchHit }

// ── CoreApi map: renderer → core (request/response) ─────────────────────────

export interface CoreApi {
  'config.get': { in: void; out: Config }
  /** app-local contract evolution (story 1.4): badge/MCP identity incl. engine version */
  'app.identity': { in: void; out: VaultIdentity }
  'vault.readNote': { in: { path: string }; out: Doc }
  /** app-local contract evolution (story 2.1): read-only markdown tree of the vault */
  'vault.tree': { in: void; out: TreeNode[] }
  'vault.search': { in: { q: string; facets?: Facets }; out: SearchHit[] }
  /** app-local contract evolution (story 2.4): facet dropdown vocabulary,
   *  aggregated core-side from vault frontmatter (memoized per mtime) */
  'vault.facets': { in: void; out: FacetValues }
  'vault.resolveLink': { in: { link: string; from: string }; out: LinkResolution }
  /** app-local contract evolution (story 3.2): optional project qualifier — lib
   *  HandoffScope semantics: inbox/outbox are relative to `project`; without it
   *  the scope is company-wide and direction is ignored. */
  'handoffs.list': { in: { scope: 'inbox' | 'outbox' | 'all'; project?: string }; out: HandoffCard[] } // (lib PR-1)
  'handoffs.consume': { in: { id: string; identity: Identity }; out: ConsumeReceipt } // (lib PR-2)
  /** M2 handoff writers (lib PR-11, stories 7.2/7.3). Identity rides the payload
   *  from the renderer's profile store — same pattern as consume. */
  'handoffs.create': { in: { input: CreateHandoffInput; identity: Identity }; out: HandoffCreateResult }
  'handoffs.reply': {
    in: { parentId: string; input: ReplyHandoffInput; identity: Identity }
    out: HandoffCreateResult
  }
  'handoffs.annotate': {
    in: { id: string; title: string; body: string; identity: Identity }
    out: HandoffCreateResult
  }
  /** M2 lifecycle v2 (story 8.1): the one non-consume transition writer (lib
   *  setHandoffStatus). Identity rides the payload — same pattern as consume. */
  'handoffs.setStatus': {
    in: { id: string; transition: HandoffTransition; identity: Identity }
    out: StatusReceipt
  }
  /** M2 threads (story 8.2): DERIVED from listHandoffs + replies_to/fulfills
   *  edges — no new persistent state; comments ride the rail, never the board. */
  'handoffs.thread': { in: { id: string }; out: HandoffThread }
  /** M2 read-state (story 9.2): per-user unread tracking in app.db — the
   *  renderer's ONLY access path (core host is the sole SQLite opener).
   *  Paths are vault-relative note paths; read_at null = never read. */
  'readState.get': { in: { paths: string[] }; out: Record<string, string | null> }
  'readState.mark': { in: { paths: string[] }; out: void }
  /** app-local contract evolution (story 3.4): identity profile, app-side only —
   *  persisted in the core host's settings JSON (app.db seam, story 3.6) */
  'settings.identity.get': { in: void; out: IdentitySettings }
  'settings.identity.set': { in: Identity; out: void }
  /** app-local contract evolution (story 1.6): MCP host state + port override.
   *  The override applies on the next core-host start (vault switch or relaunch). */
  'mcp.status': { in: void; out: McpStatus }
  'settings.mcpPort.set': { in: { port: number | null }; out: void }
  /** app-local contract evolution (story 14.1): theme preference — per-user app
   *  state, persisted core-side (settings JSON → app.db seam, story 9.2) */
  'settings.theme.get': { in: void; out: ThemeSetting }
  'settings.theme.set': { in: { theme: ThemeSetting }; out: void }
  /** Story 7.4: read-only plan (lib previewRoute) for the confirm card; the
   *  in-shape gained mode/projectName over the v1 sketch (app-local evolution). */
  'route.preview': {
    in: { file: string; mode: 'move' | 'copy'; projectName?: string }
    out: RoutePreview
  }
  /** Story 7.4: plan+execute in one call (lib routeFile) under the write lock. */
  'route.file': {
    in: { path: string; mode: 'move' | 'copy'; projectName?: string }
    out: { written: string[] }
  }
  'route.undo': { in: { receiptId: string }; out: void } // (lib PR-3)
  'sync.status': { in: void; out: SyncHealth } // (lib PR-4)
  'sync.run': { in: void; out: SyncReport } // (lib PR-5)
  /** app-local contract evolution (story 5.2): engine/schema handshake (NFR8) */
  'sync.handshake': { in: void; out: HandshakeStatus }
  'dashboard.build': { in: void; out: ProductDashboard }
  /** app-local contract evolution (story 2.5): the Start Here brief + freshness */
  'home.brief': { in: void; out: HomeBrief }
  /** Vault Atlas (story 10.1): the whole derived graph — nodes, typed edges,
   *  clusters, precomputed positions — built core-side from existing indexes.
   *  Memoized; invalidated on vault.changed / post-pull reconcile (F4 tier). */
  'atlas.graph': { in: { level: AtlasLevel; scope?: AtlasScope }; out: AtlasGraph }
  /** Vault Atlas tours (story 10.5): reading-order / thread / topic tours
   *  extracted core-side from existing truth — no LLM, no persistent state. */
  'atlas.tours': { in: { scope?: AtlasScope }; out: TourDef[] }
  /** Path tracing (story 10.6): BFS shortest path over the core-side model's
   *  bidirectional adjacency; null = disconnected (one honest sentence). */
  'atlas.path': { in: { from: string; to: string }; out: AtlasPathResult | null }
  'vault.createOrJoin': { in: WizardInput; out: WizardResult }
  /** app-local contract evolution (story 6.2): optional window size for paging */
  'activity.feed': { in: { since?: string; limit?: number }; out: ActivityEvent[] } // (lib PR-6)
}

// ── CoreEvent union: core → renderer (push, one channel) ────────────────────

export type CoreEvent =
  | { kind: 'handoff.new'; handoff: HandoffCard }
  /** M2 (stories 7.2/7.3): a write landed a new note. `card` carries the board
   *  card for optimistic insert; null for comments (thread data, never a card). */
  | { kind: 'handoff.created'; card: HandoffCard | null; relPath: string }
  /** M2 (story 8.1): payload gains reason?/until? — decline/snooze detail for
   *  the board toast; absent on every other transition. */
  | {
      kind: 'handoff.stateChanged'
      id: string
      from: string
      to: string
      by: Identity
      reason?: string
      until?: string
    }
  /** M2 (story 9.2): a snooze's `snoozed_until` passed — fired ONCE per machine
   *  (app-db notified flag). A toast + board resort; NEVER an auto status write. */
  | { kind: 'snooze.expired'; handoffId: string }
  | { kind: 'route.completed'; receipt: RoutePreview }
  | { kind: 'vault.changed'; paths: string[] }
  | { kind: 'sync.changed'; health: SyncHealth }
  | { kind: 'git.warning'; text: string } // F8: surface stderr, never swallow

// ── Core → main control channel (story 3.7) ────────────────────────────────
// The core host DECIDES (filter, dedupe, batch); main only DISPLAYS (native
// Notification + dock badge). Travels over process.parentPort, not the seam.

export type MainControlMessage =
  | { t: 'notify'; title: string; body: string; relPath: string }
  | { t: 'badge'; count: number }

/** Main → core over the same fork channel: brokered ports (story 1.1) and
 *  window focus state driving the poller cadence (story 9.1). */
export type CoreControlMessage = { t: 'port' } | { t: 'focus'; focused: boolean }

export function isMainControlMessage(v: unknown): v is MainControlMessage {
  if (typeof v !== 'object' || v === null || !('t' in v)) return false
  const m = v as MainControlMessage
  if (m.t === 'notify') {
    return typeof m.title === 'string' && typeof m.body === 'string' && typeof m.relPath === 'string'
  }
  if (m.t === 'badge') return typeof m.count === 'number'
  return false
}

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
  // M2 handoff-writer codes (lib HandoffError, architecture-m2.md#2)
  | 'ILLEGAL_TRANSITION'
  | 'AMBIGUOUS_HANDOFF'
  | 'UNKNOWN_HANDOFF'

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
