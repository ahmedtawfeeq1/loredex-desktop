/**
 * THE seam between renderer and core host — transcribed verbatim from
 * architecture.md#ipc-contract. One generic request/response channel pattern,
 * one push event channel. All payload types live here or in ./types.ts.
 */
import type {
  ClientInfo,
  Config,
  Doc,
  InboxItem,
  LintFinding,
  ProductDashboard,
  SearchHit,
  SnapshotResult,
  SnapshotSummary,
  WorkspaceResult,
  WorkItem,
  WorkPatch,
  WorkReceipt,
} from 'loredex'
import type { FontSettings } from './font-settings'
import type { ThemeSetting } from './theme'
import type {
  AuthStatus,
  DeviceCode,
  DexRepo,
  McpLogEntry,
  ActivityEvent,
  AtlasGraph,
  AtlasLevel,
  AtlasPathResult,
  AtlasScope,
  ClientWorkspaceStatus,
  ConsumeReceipt,
  ContractChange,
  CreateClientSpec,
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
  DuplicateGroup,
  Identity,
  IdentitySettings,
  JoinVaultResult,
  LinkResolution,
  McpStatus,
  NoteComment,
  PermissionRule,
  PrInfo,
  ProjectRootsMap,
  RailsCollapsed,
  RemoteCheck,
  ReplyHandoffInput,
  RoutePreview,
  RouteReceipt,
  StatusReceipt,
  SyncHealth,
  SyncReport,
  TourDef,
  TreeNode,
  TreeSectionsCollapsed,
  StagedEditsReport,
  VaultIdentity,
  WizardFlow,
  WizardStepStatus,
} from './types'

// Payload types that exist in the pinned loredex are imported, never redefined.
export type { ClientInfo, Config, Doc, LintFinding, ProductDashboard, SearchHit, WorkspaceResult }
export type { WorkItem, WorkPatch, WorkReceipt } from 'loredex'
export type { SnapshotResult, SnapshotSummary } from 'loredex'
export type { InboxItem } from 'loredex'
export type { ClientWorkspaceStatus, CreateClientSpec } from './types'
export type { PermissionRule } from './types'
export type { EditState, StagedEdit, StagedEditsReport } from './types'

// ── ACP agent panels (acp blueprint 2026-07-18): shared types ───────────────

export type AcpAgent = 'claude' | 'codex' | 'gemini'
export type AcpSessionState = 'starting' | 'ready' | 'auth_required' | 'error' | 'exited'
export interface AcpPermissionOption {
  optionId: string
  name: string
  kind: 'allow_once' | 'allow_always' | 'reject_once' | 'reject_always'
}
export interface AcpPlanEntry {
  content: string
  priority: 'high' | 'medium' | 'low'
  status: 'pending' | 'in_progress' | 'completed'
}
/** Tool-call output the adapter already sends (sdk ToolCallContent). Diffs ride
 *  here — no `fs` capability needed (paths are ABSOLUTE, relativize to open). */
export type AcpToolContent =
  | { kind: 'diff'; path: string; oldText?: string; newText: string }
  | { kind: 'text'; text: string }
/** A file the tool touched (sdk ToolCallLocation) — path ABSOLUTE, optional line. */
export interface AcpToolLocation {
  path: string
  line?: number
}
/** Captured from InitializeResponse.authMethods for the Phase-2 login UI — we
 *  only capture now, no login flow is built. `type` is 'env_var' | 'terminal' |
 *  undefined (agent-handled, the default method has no discriminator). */
export interface AcpAuthMethod {
  id: string
  name: string
  description?: string
  type?: string
}
/** A slash-command the agent advertises (sdk AvailableCommand). */
export interface AcpCommand {
  name: string
  description: string
  hint?: string
}
/** A session mode the agent can operate in (sdk SessionMode). */
export interface AcpMode {
  id: string
  name: string
  description?: string
}
/** An MCP server attached to a session, surfaced to the renderer as name/url
 *  ONLY (the per-session bearer token never crosses this seam — A7). */
export interface AcpMcpServer {
  name: string
  url?: string
}
/** B4 prompt attachment: an image (base64-in-JSON — MessagePort-safe; a
 *  dedicated large-file channel is deferred) or a file path the adapter reads
 *  itself (no `fs` client capability — a baseline resource_link block). Images
 *  ride only when the session advertises promptCapabilities.image (else dropped
 *  with a renderer notice); a file path is always allowed (baseline block). */
export type AcpAttachment =
  | { type: 'image'; mimeType: string; dataB64: string }
  | { type: 'resource'; path: string }

// ── ACP conversation transcript (Phase 2 B0): the vault-scoped, core-persisted
// thread. The renderer's AcpChatItem[] is a VIEW of this — hydrated on session
// open, and replayed (renderSeed) as cross-provider seed context (there is no
// protocol cross-provider session id). Same-provider resume uses the adapter's
// own acp_session_id (provider-scoped), stored per (conversation, provider). ──

/** One persisted transcript message. Storage collapses to one row per
 *  contiguous agent/thought run, per tool (by toolCallId, sparse-merged), and
 *  per user turn — so this maps 1:1 to an AcpChatItem on hydration. `title` is
 *  optional because a tool_call_update carries only the changed fields. */
export interface AcpConvMessage {
  role: 'user' | 'agent' | 'thought' | 'tool'
  text?: string
  tool?: {
    toolCallId: string
    title?: string
    toolKind?: string
    status?: string
    content?: AcpToolContent[]
    locations?: AcpToolLocation[]
  }
}
/** One row of agent.conv.list — newest-updated first, provider-neutral. */
export interface AcpConvSummary {
  id: string
  title: string | null
  lastProvider: AcpAgent
  /** WP-A: agent-ops client this thread was started under (◈ chip in history) —
   *  null for vault-root / research threads. */
  clientSlug?: string | null
  createdAt: string
  updatedAt: string
}
/** WP-D: one stored client login — metadata only, NEVER the secret (revealed
 *  on demand via clients.credentials.reveal). */
export interface ClientCredential {
  id: string
  label: string
  username: string
  url?: string
  note?: string
}

/** agent.conv.load payload — the thread plus the per-provider adapter session
 *  ids (provider-scoped, for same-provider native resume). vault_id is scoped
 *  at the seam (unknown / cross-vault id → ACP_CONV_UNKNOWN) so it is not
 *  surfaced here. */
export interface AcpConvLoad {
  id: string
  title: string | null
  lastProvider: AcpAgent
  /** WP-A: agent-ops client this thread was started under — null for vault-root
   *  / research threads. */
  clientSlug?: string | null
  /** BL-5: the folder this thread was started in. Continuing it (provider
   *  switch / reopen / pop-out) respawns the adapter here so the folder's
   *  `.mcp.json` servers load again. Null for older threads. */
  cwd?: string | null
  providers: { provider: AcpAgent; acpSessionId: string | null }[]
  messages: AcpConvMessage[]
}

// ── CoreApi map: renderer → core (request/response) ─────────────────────────

export interface CoreApi {
  'config.get': { in: void; out: Config }
  /** app-local contract evolution (story 1.4): badge/MCP identity incl. engine version */
  'app.identity': { in: void; out: VaultIdentity }
  'vault.readNote': { in: { path: string }; out: Doc }
  /** app-local contract evolution (story 2.1): read-only markdown tree of the vault */
  'vault.tree': { in: void; out: TreeNode[] }
  /** agent-ops dexes: the dex's declared type (research when absent) */
  'vault.dexInfo': { in: void; out: { type: 'research' | 'agent-ops' } }
  /** agent-ops: raw read of a yaml/json/csv data file (containment + allowlist core-side) */
  'vault.readRaw': { in: { path: string }; out: { raw: string; fileType: 'yaml' | 'json' | 'csv' } }
  /** agent-ops: fleet read model — every client with pipelines/agents/stages/tables/inbox */
  'clients.fleet': { in: void; out: ClientInfo[] }
  /** agent-ops: lint findings (schema violations, workspace drift, committed secrets) */
  'clients.lints': { in: void; out: LintFinding[] }
  /** agent-ops: generate (or check) a client's workspace files from workspace.yml */
  'clients.workspace': { in: { client: string; check: boolean }; out: WorkspaceResult }
  /** agent-ops Add-Client (docs/plan/agent-ops-desktop-flow.md): scaffold + golden
   *  copy + keychain tokens + materialize + one attributed commit, in one verb.
   *  Tokens ride the payload once, land in the OS keychain + gitignored files only. */
  'clients.create': {
    in: { spec: CreateClientSpec; tokens: Record<string, string>; identity: Identity }
    out: { slug: string; workspace: WorkspaceResult }
  }
  /** agent-ops: per-machine wiring state — declared ${VAR} refs vs this machine's
   *  keychain + generated-file drift. Drives the needs-token badge. */
  'clients.workspace.status': { in: { client: string }; out: ClientWorkspaceStatus }
  /** agent-ops: paste/replace this machine's tokens for a client, re-materialize.
   *  No commit — only keychain + gitignored generated files change. */
  'clients.tokens.set': {
    in: { client: string; tokens: Record<string, string> }
    out: WorkspaceResult
  }
  /** agent-ops: the golden client's mcp connections — Add-Client modal checkboxes */
  'clients.connections': {
    in: { client: string }
    out: Array<{
      server: string
      envRefs: string[]
      command: string
      args: string[]
      env: Record<string, string>
    }>
  }
  /** agent-ops: bring one client (or whole fleet if client omitted) up to the
   *  canonical structure — folders, .gitkeep, starter pipeline/stage/agent —
   *  one attributed commit. Idempotent. */
  'clients.normalize': {
    in: { client?: string; identity: Identity }
    out: { normalized: number }
  }
  /** agent-ops: the dex's standard tooling — deduped connection union across all
   *  tooled clients, each with its copy source. The UI asks for tokens only. */
  'clients.standardTooling': {
    in: void
    out: Array<{ server: string; source: string; envRefs: string[] }>
  }
  /** agent-ops: copy a golden client's tooling onto an EXISTING client (create's
   *  copy step, post-hoc) — golden-keyed tokens, one attributed commit */
  'clients.tooling.copy': {
    in: {
      client: string
      from: string
      servers?: string[]
      tokens: Record<string, string>
      identity: Identity
    }
    out: WorkspaceResult
  }
  /** agent-ops: LIVE health probe of one connection — spawns the mcp server with
   *  this machine's keychain tokens and completes a JSON-RPC initialize. The only
   *  honest "connected": a held token can still be revoked server-side. */
  'clients.connections.test': {
    in: { client: string; server: string }
    out: { ok: boolean; detail: string }
  }
  /** agent-ops: the client's absolute directory — the in-app terminal's cwd for
   *  "Open in Terminal" (so `claude` runs in that client's folder) */
  'clients.dirAbs': { in: { client: string }; out: { dir: string } }
  // ── WP-C: snapshots ──
  /** agent-ops: version one pipeline/agent into _versions/<unit>/<stamp>/ — copies
   *  the definition files (+ optional knowledge tables), one attributed commit. */
  'clients.snapshot.create': {
    in: { client: string; unit: string; tables?: boolean; note?: string; identity: Identity }
    out: SnapshotResult
  }
  /** agent-ops: list a client's snapshots (all units), newest stamp first. */
  'clients.snapshot.list': { in: { client: string }; out: SnapshotSummary[] }
  /**
   * agent-ops: build this client's knowledge base as one .xlsx, a sheet per
   * table, and hand back the bytes base64-encoded (the IPC channel is JSON).
   *
   * It returns bytes rather than writing a file because an export is an
   * artefact to send someone, not dex content: the renderer passes it to the
   * native save panel, so it lands wherever the user chooses and never in the
   * vault, where a binary regenerable from CSV would only bloat the history.
   */
  'clients.kb.export': {
    in: { client: string }
    out: {
      /** the .xlsx, base64 */
      base64: string
      filename: string
      tables: { name: string; rows: number; columns: number }[]
      skipped: { name: string; reason: string }[]
    }
  }
  // ── WP-G: scaffold new units + inbox consumption (one attributed commit each) ──
  'clients.scaffold.pipeline': {
    in: { client: string; name: string; identity: Identity }
    out: { dir: string }
  }
  'clients.scaffold.agent': {
    in: { client: string; name: string; identity: Identity }
    out: { dir: string }
  }
  'clients.scaffold.stage': {
    in: {
      client: string
      pipeline: string
      name: string
      before?: string
      after?: string
      identity: Identity
    }
    out: { dir: string; renumbered: Array<{ from: string; to: string }> }
  }
  'clients.inbox.list': { in: { client: string }; out: InboxItem[] }
  'clients.inbox.toRandoms': {
    in: { client: string; name: string; identity: Identity }
    out: { moved: string }
  }
  'clients.inbox.delete': {
    in: { client: string; name: string; identity: Identity }
    out: { deleted: string }
  }
  // ── WP-D: per-client login credentials (machine-local keychain, never the dex) ──
  /** metadata only — never a secret; the card lists logins from this. */
  'clients.credentials.list': { in: { client: string }; out: ClientCredential[] }
  /** create (no id) or edit (id) a login; secret optional on edit (keeps existing). */
  'clients.credentials.set': {
    in: {
      client: string
      id?: string
      label: string
      username: string
      secret?: string
      url?: string
      note?: string
    }
    out: { id: string }
  }
  'clients.credentials.delete': { in: { client: string; id: string }; out: void }
  /** reveal one secret on demand — the only path a secret leaves the store. */
  'clients.credentials.reveal': { in: { client: string; id: string }; out: { secret: string } }
  'vault.search': { in: { q: string; facets?: Facets }; out: SearchHit[] }
  /** app-local contract evolution (story 2.4): facet dropdown vocabulary,
   *  aggregated core-side from vault frontmatter (memoized per mtime) */
  'vault.facets': { in: void; out: FacetValues }
  /** duplicate-note detection (multi-actor curate collision): notes filed twice
   *  from the same upstream source. Read-only scan. */
  'vault.duplicates': { in: void; out: DuplicateGroup[] }
  /** delete the given vault-relative duplicate copies + commit; identity rides
   *  the payload (F7). Guarded per-path through resolveNoteInsideVault. */
  'vault.dedupe': { in: { paths: string[]; identity: Identity }; out: { removed: string[] } }
  'vault.resolveLink': { in: { link: string; from: string }; out: LinkResolution }
  /** ACP file-refs (acp Phase 1 A2): agent tool paths are ABSOLUTE (Diff.path,
   *  ToolCallLocation.path); the renderer needs a vault-relative path to open()
   *  the note. Pure — mirrors the core-side toVaultRelative. */
  'vault.relativize': { in: { path: string }; out: { rel: string } }
  /** archive (→ _archive/), unarchive (back home), or delete — one commit */
  'vault.removeNote': {
    in: { path: string; mode: 'delete' | 'archive' | 'unarchive'; identity: Identity }
    out: { path: string }
  }
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
  /** parity slice C — Settings › MCP server: real switches + the copyable
   *  connect snippet (built core-side; the bearer token never rides IPC
   *  except inside this one deliberate copy action). */
  'mcp.settings.get': { in: void; out: { autostart: boolean; writeTools: boolean } }
  'mcp.settings.set': { in: { autostart?: boolean; writeTools?: boolean }; out: void }
  'mcp.connectSnippet': { in: void; out: { snippet: string } }
  /** v3 §6.5 (story 26.5): the Agents view's read-only session telemetry —
   *  the in-app MCP host's request ring. Zero engine writes. */
  'agents.sessions': { in: void; out: { log: McpLogEntry[]; mcp: McpStatus } }
  /** story 26.9 per-agent MCP tokens: mint returns the token ONCE; list is
   *  names only — tokens never re-cross the seam. */
  'agents.tokens.list': { in: void; out: string[] }
  'agents.tokens.mint': { in: { name: string }; out: { token: string } }
  'agents.tokens.revoke': { in: { name: string }; out: void }
  /** v3 §9 GitHub auth (story 26.7, AUTH-GITHUB.md). The token never crosses
   *  this seam — status is masked; login stores core-side. */
  'auth.status': { in: void; out: AuthStatus }
  'auth.loginWithToken': { in: { token: string }; out: AuthStatus }
  'auth.logout': { in: void; out: AuthStatus }
  'auth.deviceStart': { in: void; out: DeviceCode }
  'auth.devicePoll': {
    in: { deviceCode: string }
    out: { state: 'authorized' | 'pending' | 'slow_down' | 'expired' | 'denied' }
  }
  'dex.registry': { in: void; out: DexRepo[] }
  /** v3 Plan/Today (slices D/E): the lib work-item plane (loredex ≥2.8) —
   *  reads are board rows; the one writer patches task frontmatter only. */
  'work.list': { in: void; out: WorkItem[] }
  'work.update': { in: { id: string; patch: WorkPatch; identity: Identity }; out: WorkReceipt }
  'dex.createRepo': { in: { name: string; isPrivate: boolean }; out: DexRepo }
  'settings.mcpPort.set': { in: { port: number | null }; out: void }
  /** Apply & retry: (optionally) persist a new port, then rebind the in-app MCP
   *  host now — clears a stale port-conflict without relaunching. */
  'mcp.restart': { in: { port?: number | null }; out: McpStatus }
  /** app-local contract evolution (story 14.1): theme preference — per-user app
   *  state, persisted core-side (settings JSON → app.db seam, story 9.2) */
  'settings.theme.get': { in: void; out: ThemeSetting }
  'settings.theme.set': { in: { theme: ThemeSetting }; out: void }
  /** app-local: per-user font preferences (app UI + per-note-format), applied
   *  renderer-side by stamping CSS vars — same seam as theme. */
  'settings.fonts.get': { in: void; out: FontSettings }
  'settings.fonts.set': { in: { fonts: FontSettings }; out: void }
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
  /** Story 7.4: plan+execute in one call (lib routeFile) under the write lock.
   *  epic4: returns the PR-3 receiptId so the host can offer one-click Undo. */
  'route.file': {
    in: { path: string; mode: 'move' | 'copy'; projectName?: string }
    out: { written: string[]; receiptId?: string }
  }
  /** epic4.story2: reverse a route by its receipt (lib PR-3 undoRoute), under the
   *  write lock — restores byte-identical state + indexes; a superseded receipt
   *  rejects with ROUTE_ALREADY_UNDONE, a missing one ROUTE_RECEIPT_NOT_FOUND. */
  'route.undo': { in: { receiptId: string }; out: void } // (lib PR-3)
  /** epic4.story2: persisted route receipts, newest first — powers the receipt
   *  history view AND content-hash dedupe (the confirm card warns when the same
   *  source body was already routed). Read from <vault>/.loredex/receipts/. */
  'route.history': { in: { limit?: number }; out: RouteReceipt[] } // (lib PR-3)
  /** epic4.story3: never-route globs — shared lib config (saveConfig), so the CLI
   *  honors the same list. set persists through the engine facade. */
  'settings.neverRoute.get': { in: void; out: { globs: string[] } }
  'settings.neverRoute.set': { in: { globs: string[] }; out: void }
  /** epic4.story4: drift for one routed note — read-only source-vs-stamp hash
   *  compare; stale=true means the vault copy is behind its source. Re-route is
   *  the ordinary route() write, not a channel. */
  'vault.drift': { in: { path: string }; out: { stale: boolean; source?: string } }
  /** Workspace-level MCP servers — ours + n8n, not per-client (2026-07-20 spec). */
  'workspace.mcp.list': {
    in: void
    out: {
      id: 'loredex' | 'n8n'
      label: string
      enabled: boolean
      installed: boolean
      /** 'documentation' when n8n has no key; 'full' with one; null for loredex */
      mode: 'documentation' | 'full' | null
    }[]
  }
  'workspace.mcp.setEnabled': { in: { id: 'loredex' | 'n8n'; on: boolean }; out: void }
  'workspace.mcp.tools': {
    in: { id: 'loredex' | 'n8n' }
    out: { ok: boolean; tools: string[]; detail: string }
  }
  /** Best-effort install; ok:false hands back the command for the setup card. */
  'workspace.mcp.install': {
    in: { id: 'n8n' }
    out: { ok: boolean; detail: string; command: string }
  }
  /** Presence only — the key itself never crosses this seam. */
  'workspace.n8n.get': { in: void; out: { hasKey: boolean; url: string | null } }
  'workspace.n8n.set': { in: { url?: string | null; key?: string | null }; out: void }
  /** The slow on-demand half of the skills card — see the note on `terminal`. */
  'workspace.terminal.check': { in: void; out: { installed: boolean } }
  /** Real round trip to the n8n API — a saved key that 401s is otherwise only
   *  discovered mid-conversation by an agent. */
  'workspace.n8n.test': { in: void; out: { ok: boolean; detail: string } }
  /** agent-ops: fleet-wide staged pipeline edits. The genudo MCP is scoped to one
   *  account, so only the host can answer "across all clients, what never shipped". */
  'agentops.stagedEdits': { in: void; out: StagedEditsReport }
  /** Pull a client's LIVE pipeline config off the genudo platform into the vault.
   *  `preview: true` plans without writing, so the user sees it land first. */
  'clients.pull': {
    in: { client: string; identity: Identity; preview?: boolean }
    out: {
      pipelines: { id: number; name: string; slug: string; stages: number }[]
      files: string[]
      warnings: string[]
      written: boolean
    }
  }
  'workspace.skills.status': {
    in: void
    out: {
      installed: boolean
      command: string
      plugin: string
      /** the shell command that opens the claude session `command` runs INSIDE
       *  — the plugin commands are slash commands, meaningless at a shell. */
      launch: string
      /** the `claude mcp add` card for terminal-run claude. `command` carries a
       *  PLACEHOLDER key, never the stored one — it must not cross this seam.
       *  `installed` reads ~/.claude.json directly — instant, and it sees the
       *  project-scoped entry `claude mcp add` writes by default. */
      terminal: { installed: boolean; command: string }
    }
  }
  /** BL-19: before/after for a note's most recent commit — the reader's Changes
   *  panel. null when the note has no git history. oldText null = created then. */
  'note.diff': {
    in: { path: string }
    out: {
      rel: string
      oldText: string | null
      newText: string
      sha: string
      subject: string
      when: string
    } | null
  }
  'sync.status': { in: void; out: SyncHealth } // (lib PR-4)
  'sync.run': { in: void; out: SyncReport } // (lib PR-5)
  /** app-local contract evolution (story 5.2): engine/schema handshake (NFR8) */
  'sync.handshake': { in: void; out: HandshakeStatus }
  'dashboard.build': { in: void; out: ProductDashboard }
  /** re-curate a project's Start Here brief (story 2.6): the re-curate seam made
   *  real. curate is a CLI/LLM op the lib doesn't expose, so it runs the CLI in
   *  the core host (~1min) — the window drives it async and refreshes on return. */
  'dashboard.recurate': { in: { project: string }; out: { started: true } }
  /** Embedded terminal (terminal-splits blueprint 2026-07-18): pty sessions
   *  live in the CORE HOST. create/input/resize/kill are cheap invokes; the
   *  output stream rides CoreEvents (term.data batched ~8ms core-side) —
   *  a pty stream must never ride an invoke. cwd omitted → open vault root. */
  'term.create': { in: { cwd?: string; cols: number; rows: number }; out: { id: string } }
  'term.input': { in: { id: string; data: string }; out: void }
  'term.resize': { in: { id: string; cols: number; rows: number }; out: void }
  'term.kill': { in: { id: string }; out: void }
  /** Per-vault drawer prefs (rails pattern): app.db `app_settings` row
   *  `terminal`; get degrades to closed/280 while no vault/db is open. */
  'settings.terminal.get': {
    in: void
    out: { open: boolean; height: number; dock: 'bottom' | 'left'; width: number }
  }
  'settings.terminal.set': {
    in: { open: boolean; height: number; dock: 'bottom' | 'left'; width: number }
    out: void
  }
  /** ACP agent panels (acp blueprint 2026-07-18): adapter processes live in the
   *  CORE HOST. All acp.* invokes are cheap — acp.start allocates the id and
   *  returns before the adapter finishes booting; a prompt turn is an
   *  outstanding JSON-RPC request held core-side for minutes and must NEVER
   *  ride an invoke. Session state, chunks, tool calls, permission requests
   *  and turn ends all stream as CoreEvents. cwd omitted → open vault root. */
  'acp.start': {
    in: { agent: AcpAgent; cwd?: string; conversationId?: string }
    out: { sessionId: string; conversationId: string }
  }
  /** B4: a turn's user text plus optional attachments (images base64-in-JSON,
   *  file paths as baseline resource blocks). Long turns still stream — this
   *  invoke just fires the prompt (long-job law), attachments ride the JSON. */
  'acp.prompt': { in: { sessionId: string; text: string; attachments?: AcpAttachment[] }; out: void }
  'acp.cancel': { in: { sessionId: string }; out: void }
  /** optionId null = dismissed → outcome 'cancelled' (dismissing is rejecting) */
  'acp.permission': {
    in: { sessionId: string; requestId: string; optionId: string | null }
    out: void
  }
  'acp.stop': { in: { sessionId: string }; out: void }
  /** switch the agent's operating mode (session/set_mode, A7). The adapter may
   *  confirm via current_mode_update → acp.mode; the renderer also patches the
   *  current mode optimistically and reverts if this rejects. */
  'agent.setMode': { in: { sessionId: string; modeId: string }; out: void }
  /** ACP conversation transcript (Phase 2 B0): the core host is the sole SQLite
   *  opener, so the persisted thread rides these reads. list is newest-updated
   *  first + vault-scoped; load hydrates the renderer thread (and the B3 pop-out)
   *  and carries the per-provider adapter session id for same-provider resume.
   *  An unknown / cross-vault id → ACP_CONV_UNKNOWN; a bare host (no db) lists
   *  empty and load throws. */
  'agent.conv.list': { in: { limit?: number }; out: AcpConvSummary[] }
  'agent.conv.load': { in: { conversationId: string }; out: AcpConvLoad }
  /** History dropdown: rename / delete a persisted conversation (vault-scoped) */
  'agent.conv.rename': { in: { conversationId: string; title: string }; out: void }
  'agent.conv.delete': { in: { conversationId: string }; out: void }
  /** B2 cross-provider continuation: start a new session on `provider` bound to
   *  an EXISTING conversation, carrying its transcript. Same-provider with the
   *  adapter's own session id + loadSession resumes natively; anything else
   *  seeds the rendered transcript onto the first prompt. There is NO protocol
   *  cross-provider session id — the seam replays a client-held transcript.
   *  Unknown / cross-vault conversation → ACP_CONV_UNKNOWN. */
  /** `atVaultRoot` forces the vault root instead of the thread's own folder
   *  (BL-5: the "start at vault root" answer to the where-to-continue prompt). */
  'agent.continue': {
    in: { conversationId: string; provider: AcpAgent; atVaultRoot?: boolean }
    out: { sessionId: string }
  }
  /** B1 per-provider API-key auth (Settings › AI providers). The key is stored
   *  in the OS keychain (agent-keys) and folded into ONLY the matching adapter's
   *  env at spawn — it never enters process.env, the vault, a commit, a renderer
   *  payload, or a log; status returns presence ONLY. Terminal-login providers
   *  (claude/codex) reuse the CLI subscription instead — no key needed. */
  'agent.auth.status': { in: void; out: { agent: AcpAgent; hasKey: boolean }[] }
  'agent.auth.setKey': { in: { agent: AcpAgent; key: string }; out: void }
  'agent.auth.clearKey': { in: { agent: AcpAgent }; out: void }
  // ── WP-B: always-allow permission rules (per-vault; auto-answer a matching
  //    (client, tool kind) request with its own allow_once option) ──
  'agent.permissions.list': { in: void; out: PermissionRule[] }
  'agent.permissions.set': { in: { client: string; toolKind: string; decision: 'allow' }; out: void }
  'agent.permissions.remove': { in: { client: string; toolKind: string }; out: void }
  /** Per-vault panel prefs (settings.terminal pattern): app.db app_settings
   *  row `agentPanel`; get degrades to closed/340 while no vault/db is open. */
  'settings.agentPanel.get': { in: void; out: { open: boolean; width: number } }
  'settings.agentPanel.set': { in: { open: boolean; width: number }; out: void }
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
  'wizard.createVault': {
    in: { dir: string; remoteUrl?: string; dexType?: 'research' | 'agent-ops' }
    out: CreateVaultResult
  }
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
  /** re-curate finished (2026-07-18): the ~1min CLI job runs in the core
   *  host's background — the renderer's progress dialog closes on this. */
  | { kind: 'recurate.done'; project: string; ok: boolean; error?: string }
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
  | { kind: 'route.completed'; receipt: RoutePreview; receiptId?: string }
  | { kind: 'vault.changed'; paths: string[] }
  | { kind: 'sync.changed'; health: SyncHealth }
  | { kind: 'git.warning'; text: string } // F8: surface stderr, never swallow
  /** Embedded terminal (terminal-splits blueprint 2026-07-18): batched pty
   *  output + exit — the async half of the term.* invoke family. */
  | { kind: 'term.data'; id: string; data: string }
  | { kind: 'term.exit'; id: string; code: number }
  /** ACP agent panels (acp blueprint 2026-07-18): the async half of the acp.*
   *  family. acp.chunk is batched ~8ms core-side and always flushed BEFORE any
   *  other event for the same session (ordering law). detail on acp.session
   *  carries the auth message / stderr tail — bounded, never wholesale logs. */
  | {
      kind: 'acp.session'
      sessionId: string
      agent: AcpAgent
      state: AcpSessionState
      detail?: string
      /** captured on the auth_required path — Phase-2 login UI reads it (A0) */
      authMethods?: AcpAuthMethod[]
      /** MCP servers attached to the session, surfaced ONCE on ready — names/
       *  urls only, NEVER the bearer token (A7) */
      mcpServers?: AcpMcpServer[]
      /** how the adapter authenticates: 'subscription' (CLI login / plan quota)
       *  or 'api' (API key / pay-per-token). Surfaced on ready so the usage
       *  meter labels cost as an estimate vs real spend. */
      authMode?: 'subscription' | 'api'
      /** B4: whether this adapter accepts image attachments (from
       *  promptCapabilities.image, captured at initialize). Surfaced on ready so
       *  the composer can drop pasted images with a notice when unsupported. */
      imageInput?: boolean
      /** WP-A: agent-ops client slug for a `projects/<client>/…` cwd — surfaced
       *  on 'starting' + 'ready' as the panel's ◈ chip; omitted for a vault-root
       *  or research session. */
      clientSlug?: string
    }
  | { kind: 'acp.chunk'; sessionId: string; role: 'agent' | 'thought'; text: string }
  | {
      kind: 'acp.tool'
      sessionId: string
      toolCallId: string
      title?: string
      toolKind?: string
      status?: 'pending' | 'in_progress' | 'completed' | 'failed'
      /** BL-14: what the tool was ASKED to do (ToolCall.rawInput), serialized
       *  and length-capped — the row used to show only the output. */
      input?: string
      /** the adapter's tool output — diffs + text (terminal/other dropped) */
      content?: AcpToolContent[]
      /** files this tool touched — ABSOLUTE paths (relativize to open) */
      locations?: AcpToolLocation[]
    }
  | { kind: 'acp.plan'; sessionId: string; entries: AcpPlanEntry[] }
  | {
      kind: 'acp.permission'
      sessionId: string
      requestId: string
      title: string
      toolKind?: string
      options: AcpPermissionOption[]
      /** the proposed change — same diff/text the tool row renders (A3) */
      content?: AcpToolContent[]
      locations?: AcpToolLocation[]
    }
  /** best-effort token telemetry (both halves @experimental, codex may emit
   *  neither): `context`+`cost` from UsageUpdate (replaces), `turn` from
   *  PromptResponse.usage (accumulates). One event kind, either half present. */
  | {
      kind: 'acp.usage'
      sessionId: string
      context?: { used: number; size: number }
      cost?: { amount: number; currency: string }
      turn?: { total: number; input: number; output: number; cached?: number; thought?: number }
    }
  /** slash-commands the agent advertises (available_commands_update) */
  | { kind: 'acp.commands'; sessionId: string; commands: AcpCommand[] }
  /** current session mode (+ the full set on the initial event from
   *  NewSessionResponse.modes; current_mode_update carries only the id) */
  | {
      kind: 'acp.mode'
      sessionId: string
      currentModeId: string
      availableModes?: AcpMode[]
    }
  | { kind: 'acp.turnEnd'; sessionId: string; stopReason: string }

// ── Core → main control channel (story 3.7) ────────────────────────────────
// The core host DECIDES (filter, dedupe, batch); main only DISPLAYS (native
// Notification + dock badge). Travels over process.parentPort, not the seam.

export type MainControlMessage =
  | { t: 'notify'; title: string; body: string; relPath: string }
  | { t: 'badge'; count: number }
  /** WP-F: the core reports its config-resolved vault path once, so main knows
   *  the TRUSTED root for reveal/open even on a CLI-first-run (no --vault arg,
   *  no picker). Intercepted in main; never forwarded to notifications. */
  | { t: 'vault'; path: string }

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
  if (m.t === 'vault') return typeof m.path === 'string'
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
  // epic4 routing-safety codes (lib PR-3 RouteScopeError / RouteUndoError)
  | 'ROUTE_BLOCKED'
  | 'ROUTE_ALREADY_UNDONE'
  | 'ROUTE_RECEIPT_NOT_FOUND'
  // Embedded terminal (terminal-splits blueprint 2026-07-18)
  | 'TERM_CWD_INVALID'
  | 'TERM_UNKNOWN'
  // ACP agent panels (acp blueprint 2026-07-18)
  | 'ACP_CWD_INVALID'
  | 'ACP_UNKNOWN'
  | 'ACP_NOT_READY'
  | 'ACP_BUSY'
  // ACP Phase 1 (A0): auth-method rejection + unknown conversation (Phase 2)
  | 'ACP_AUTH_FAILED'
  | 'ACP_CONV_UNKNOWN'

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
