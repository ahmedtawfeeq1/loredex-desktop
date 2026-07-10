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
  ContractChange,
  CreateHandoffInput,
  CreateVaultResult,
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
  JoinVaultResult,
  LinkResolution,
  McpStatus,
  NoteComment,
  PrInfo,
  ProjectRootsMap,
  RailsCollapsed,
  RemoteCheck,
  ReplyHandoffInput,
  RoutePreview,
  StatusReceipt,
  SyncHealth,
  SyncReport,
  TourDef,
  TreeNode,
  TreeSectionsCollapsed,
  VaultIdentity,
  WizardFlow,
  WizardStepStatus,
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
  /** app-local contract evolution (story 16.2, Addendum D1): collapsible-rail
   *  state — PER-VAULT UI pref in app.db (never the vault); get degrades to
   *  expanded while no vault/db is open. */
  'settings.rails.get': { in: void; out: RailsCollapsed }
  'settings.rails.set': { in: RailsCollapsed; out: void }
  /** app-local contract evolution (story 16.3, Addendum D1): collapsed vault
   *  tree sections — PER-VAULT UI pref in app.db (never the vault); get
   *  degrades to nothing-collapsed while no vault/db is open. */
  'settings.treeSections.get': { in: void; out: TreeSectionsCollapsed }
  'settings.treeSections.set': { in: TreeSectionsCollapsed; out: void }
  /** app-local contract evolution (story epic17.4, D1 amendment 3): list-pane
   *  width — PER-VAULT UI pref in app.db (beside `rails`); clamped 200–480px,
   *  get degrades to the 300px default while no vault/db is open. */
  'settings.listWidth.get': { in: void; out: { width: number } }
  'settings.listWidth.set': { in: { width: number }; out: void }
  /** app-local contract evolution (story epic17.2, D1 amendment 3): whether the
   *  Atlas "How to read this map" legend has been shown. APP-GLOBAL (meta, not
   *  per-vault) — the first-ever Atlas visit auto-opens it once, then set. */
  'settings.atlasLegendSeen.get': { in: void; out: { seen: boolean } }
  'settings.atlasLegendSeen.set': { in: void; out: void }
  /** Edit mode (story 16.4, Addendum D1): body-only write to an EXISTING
   *  vault note — frontmatter is preserved byte-for-byte (agents own it);
   *  path guarded via the lib's resolveNoteInsideVault; git auto-commit
   *  `loredex: edit <note> (<identity name>)`. Returns the vault-relative
   *  path. Commit only — the poller/Sync now push (receipt says so). */
  'note.save': { in: { path: string; body: string; identity: Identity }; out: { path: string } }
  /** Properties panel (epic20, D1 amendment 7 §C): set or remove ONE
   *  user-owned frontmatter key on an existing note. Body preserved (parseDoc→
   *  serializeDoc round-trip), managed keys rejected (agents own frontmatter),
   *  path guarded via resolveNoteInsideVault, git auto-commit
   *  `loredex: set|remove property <key> on <note> (<name>)`. `remove: true`
   *  deletes the key. Returns the vault-relative path. */
  'note.setFrontmatter': {
    in: { path: string; key: string; value?: unknown; remove?: boolean; identity: Identity }
    out: { path: string }
  }
  /** Inline comments (story 16.4): anchored comments replying to one note —
   *  read-only vault scan, anchored (`anchor:`) comments only (non-anchored
   *  handoff comments stay the thread rail's, story 8.2). */
  'note.comments': { in: { path: string }; out: NoteComment[] }
  /** Inline comments (story 16.4): create an anchored `type: comment` note
   *  beside the parent — the annotateHandoff frontmatter contract extended
   *  with anchor/author/created; plain vault markdown, agents read it via
   *  CLI/MCP natively. The parent note is never mutated. */
  'note.comment.create': {
    in: { path: string; anchor: string; body: string; identity: Identity }
    out: HandoffCreateResult
  }
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
  /** M2 contract intelligence (story 11.1): merged, date-sorted change rows
   *  from the app-db contract_scan cache (incremental git-log scan on demand).
   *  Read-only against the repos — no vault writes, no worktree diffs. */
  'contracts.timeline': { in: { project?: string }; out: ContractChange[] }
  /** M2 (story 11.2): one commit's unified diff for one contract file —
   *  `git show <sha> -- <file>`, pinned to commits, NEVER the worktree.
   *  200 KB cap; larger diffs return truncated: true (visible notice, no
   *  silent cut). */
  'contracts.diff': {
    in: { repoRoot: string; file: string; sha: string }
    out: { unified: string; truncated: boolean }
  }
  /** Project roots for the contract scan (m2 §5 precedence). fromConfig=true →
   *  loredex config.projects won; the set channel writes app-db only and never
   *  touches config.json. */
  'settings.projectRoots.get': { in: void; out: { roots: ProjectRootsMap; fromConfig: boolean } }
  'settings.projectRoots.set': { in: { roots: ProjectRootsMap }; out: void }
  /** User contract globs, added to the fixed pattern set (app-db, per vault). */
  'settings.contractGlobs.get': { in: void; out: { globs: string[] } }
  'settings.contractGlobs.set': { in: { globs: string[] }; out: void }
  /** M2 GitHub layer (story 12.2, m2 §8 verbatim): PR referencing a commit via
   *  the gh CLI — 5 s timeout, per-sha session cache; null = no gh / no PR /
   *  non-GitHub (chip degrades to the plain commit link). */
  'github.prForCommit': { in: { repoRoot: string; sha: string }; out: PrInfo | null }
  /** app-local contract evolution (story 12.2): gh capability for the Settings
   *  hint row; refresh=true re-runs detection (the "settings change" re-check). */
  'github.capability': { in: { refresh?: boolean }; out: { gh: boolean } }
  /** app-local contract evolution (story 12.2 AC4): persist a suggestion
   *  dismissal (app_settings key `dismissed:<handoffId>:<sha>`) — the
   *  suggestion never re-fires. Apply is NOT a channel: it rides the ordinary
   *  handoffs.setStatus / handoffs.consume writers. */
  'suggest.dismiss': { in: { handoffId: string; sha: string }; out: void }
  /** M2 wizards (story 13.1, m2 §7 verbatim): `git ls-remote` preflight — no
   *  writes, no lock; a bad URL/credentials fails before the disk is touched. */
  'wizard.validateRemote': { in: { url: string }; out: RemoteCheck }
  /** Create-vault sequence (story 13.1): scaffold + config + git init, then
   *  optional remote wiring + cursor seed. Steps stream as wizard.progress;
   *  every failure after scaffold leaves a valid LOCAL vault (AC4). */
  'wizard.createVault': { in: { dir: string; remoteUrl?: string }; out: CreateVaultResult }
  /** Join-vault sequence (story 13.2): clone (streamed) → shape validation →
   *  schema handshake → register → merge driver + first fetch + cursor seed.
   *  `branch` rides the loredex://join deep link (app-local evolution). The
   *  v0.1 `vault.createOrJoin` channel is REMOVED in favor of these three. */
  'wizard.joinVault': { in: { url: string; dest: string; branch?: string }; out: JoinVaultResult }
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
  /** M2 (story 12.2, m2 §6): a merged PR / mentioned-tier commit references an
   *  open|accepted handoff owned by my project — a SUGGESTION toast with
   *  one-click Apply. Silent auto-transitions are a bug, categorically. */
  | {
      kind: 'suggest.statusChange'
      handoffId: string
      suggested: 'consumed' | 'accepted'
      evidence: { sha: string; prUrl?: string }
    }
  /** M2 (story 11.1): the post-integrate scan found a new contract change —
   *  the Contracts view refreshes; never a notification (m2 §5 honesty rule). */
  | { kind: 'contract.changed'; project: string; file: string; sha: string }
  /** M2 wizards (stories 13.1/13.2, m2 §8): step state for the stepped modal.
   *  Steps stream in sequence order; 'failed' always precedes the envelope the
   *  invoke rejects with, so the list shows WHERE the flow stopped. */
  | {
      kind: 'wizard.progress'
      flow: WizardFlow
      step: string
      status: WizardStepStatus
      detail?: string
    }
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
  // M2 wizard codes (stories 13.1/13.2, architecture-m2.md#7 verbatim)
  | 'DEST_NOT_EMPTY'
  | 'REMOTE_UNREACHABLE'
  | 'PUSH_REJECTED'
  | 'IDENTITY_MISSING'
  | 'CLONE_AUTH_FAILED'
  | 'NOT_A_VAULT'

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
