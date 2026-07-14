/**
 * Local stubs for payload types not yet exported by the pinned loredex release.
 * Each stub is replaced by `import type { ... } from 'loredex'` when its lib PR
 * lands (marker below). App-local view types live here permanently.
 * Rule: never inline-duplicate these anywhere else (architecture.md#coding-standards #2).
 */

// ── loredex payload types (landed lib PRs re-exported; rest still stubbed) ──

/** (lib PR-1, PR-2, PR-4, PR-6, PR-11 — landed, local file: dep) */
import type { CreateHandoffInput, Identity } from 'loredex'

export type {
  ActivityEvent,
  Config,
  ConsumeReceipt,
  CreateHandoffInput,
  HandoffCard,
  HandoffCreateResult,
  HandoffTransition,
  Identity,
  RouteReceipt,
  StatusReceipt,
  SyncHealth,
} from 'loredex'

/** Reply payload (lib PR-11): route + replies_to are derived from the parent. */
export type ReplyHandoffInput = Omit<CreateHandoffInput, 'fromProject' | 'toProject' | 'repliesTo'>

/**
 * Route plan for the confirm card (story 7.4, built on lib previewRoute).
 * Lib PR-3 (plan/apply split + persisted receipts + undo) supersedes this shape.
 */
export interface RoutePreview {
  /** absolute source path (outside the vault) */
  file: string
  /** absolute destination path, collision-suffixed exactly like the executor */
  destination: string
  /** planned owning project; '' = ambiguous — the confirm card requires a select */
  project: string
  /** the exact frontmatter the route would stamp (lib plannedMeta) */
  meta: Record<string, unknown>
}

/** (lib PR-5) */
export interface SyncReport {
  pulled: number
  pushed: boolean
  warnings: string[]
}

// ── app-local view types (permanent) ────────────────────────────────────────

/**
 * Vault identity shown by the chrome badge (F14/F6 evidence) and later echoed
 * by MCP responses. Built core-side from the resolved config + loredex version.
 */
export interface VaultIdentity {
  vaultPath: string
  /** vaultPath with the home dir abbreviated to ~ (chip display; tooltip keeps full) */
  displayPath: string
  /** where the vault path came from: the loredex config file or the app picker */
  configSource: 'loredex-config' | 'vault-picker'
  /** origin remote url read from <vault>/.git/config, if any */
  remote: string | null
  /** version of the embedded loredex engine (F6 evidence) */
  engineVersion: string
}

/** Vault markdown tree node (story 2.1) — read-only listing, core-host walk. */
export interface TreeNode {
  /** display name: file basename without .md (data files keep their extension), or folder name */
  name: string
  /** vault-relative path (posix separators) */
  path: string
  kind: 'dir' | 'file'
  /** set on files; data types only appear on agent-ops dexes */
  fileType?: 'md' | 'yaml' | 'json' | 'csv'
  children?: TreeNode[]
}

/** Frontmatter facets narrowing full-text hits (story 2.4). Values come from
 *  the vault's own frontmatter (aggregated, never hardcoded). */
export interface Facets {
  project?: string
  topic?: string
  type?: string
  status?: string
  /** handoff route facets: sending / receiving project */
  from?: string
  to?: string
  /** epic22 query operators: a frontmatter tag, and filed-note date bounds
   *  (YYYY-MM-DD, compared against the hit's date). */
  tag?: string
  before?: string
  after?: string
  on?: string
  /** agent-ops: the manager a hit's client is filed under (products manifest) */
  manager?: string
}

/** Facet vocabulary aggregated from vault frontmatter (story 2.4). */
export interface FacetValues {
  projects: string[]
  topics: string[]
  types: string[]
  statuses: string[]
}

/** Wikilink resolution result (story 2.2) — read-only view logic, app-side. */
export interface LinkCandidate {
  /** vault-relative path */
  path: string
  /** project context for the disambiguation picker */
  project: string
}

export interface LinkResolution {
  status: 'resolved' | 'ambiguous' | 'broken'
  /** vault-relative path of the unique match (status 'resolved') */
  target?: string
  /** all matches with project context (status 'ambiguous') */
  candidates?: LinkCandidate[]
}

/**
 * Identity settings payload (story 3.4). The profile is app-side state, never
 * vault state; ambient is the vault repo's git config, offered as the default.
 */
export interface IdentitySettings {
  profile: Identity | null
  ambient: Identity | null
}

/**
 * Engine/schema handshake (story 5.2, NFR8): what this app's engine supports
 * vs what the vault's notes declare (lib vaultSchemaStatus). A vault written
 * by a newer CLI than the app's pinned engine must warn LOUDLY (split-brain).
 */
export interface HandshakeStatus {
  engineVersion: string
  schemaSupported: number
  /** highest loredex_schema any vault note declares; null = pre-versioning vault */
  schemaDeclared: number | null
  ok: boolean
}

/**
 * Product home payload (story 2.5): the Start Here brief as it sits on disk,
 * or a live-rendered deterministic dashboard when no brief file exists yet.
 */
export interface HomeBrief {
  /** vault-relative brief path; null when rendered live (no file) */
  path: string | null
  markdown: string
  /** brief file mtime ISO (freshness badge); null when rendered live */
  mtime: string | null
  generated: boolean
}

/**
 * In-app MCP server state (story 1.6). Loud-failure port policy: 'port-conflict'
 * renders as a prominent sync-health error with a settings override — the app
 * never silently falls back to listen(0).
 */
export interface McpStatus {
  state: 'running' | 'port-conflict' | 'stopped'
  /** actually bound port when running (what the discovery file records) */
  port: number | null
  preferredPort: number
  /** persisted settings override; null = default port */
  portOverride: number | null
  /** failure detail for the sync-health surface */
  message: string | null
  /** ~/.loredex/desktop.json when written */
  discoveryPath: string | null
}

/**
 * Thread rail types (story 8.2). The m2 contract sketches HandoffCard[] here;
 * app-local evolution: comments (`type: 'comment'`) are rail members but never
 * board cards, so the rail carries this projection — paths vault-relative for
 * the reader, comments with status '' and kind 'comment'.
 */
export interface ThreadCard {
  id: string
  /** vault-relative path (reader open target) */
  path: string
  from: string
  to: string
  /** handoff objective, or the comment's title */
  objective: string
  date: string
  /** handoff status; comments carry none ('') */
  status: string
  /** request | delivery | comment */
  kind: string
  repliesTo?: string
  fulfills?: string
  expired: boolean
}

export interface ThreadReply extends ThreadCard {
  /** rail indent: 1 = direct reply to the focused handoff */
  depth: number
}

/** A replies_to/fulfills name that no longer resolves — diagnostic, never
 *  auto-created, never crashing the rail (story 8.2 AC4). */
export interface BrokenThreadRef {
  /** id of the note carrying the dangling reference */
  ownerId: string
  field: 'replies_to' | 'fulfills'
  name: string
}

export interface HandoffThread {
  /** root … parent (transitive replies_to walk, cycle-guarded) */
  ancestors: ThreadCard[]
  /** depth-first rail below the focused handoff (comments included) */
  replies: ThreadReply[]
  /** the request this delivery fulfills, when it resolves */
  fulfills?: ThreadCard
  /** deliveries whose `fulfills` resolves to this request (story 8.3 badge) —
   *  derived from the same edge model, the request's status is never written */
  fulfilledBy: ThreadCard[]
  broken: BrokenThreadRef[]
}

// ── Vault Atlas (epic 10, ATLAS-1..4 — docs/plan/ATLAS-CONCEPT.md) ──────────

export type AtlasLevel = 'overview' | 'learn' | 'deep'

/** Discrete navigation scope — never camera zoom (ATLAS-3). */
export interface AtlasScope {
  project?: string
  topic?: string
}

/** Exactly 6 node types — the taxonomy is binding (ATLAS-CONCEPT §2).
 *  Hyperlink-everything corollary: a type with no resolution target does not
 *  get to be a node, so every field below serves a card or its resolution. */
export type AtlasNodeType = 'project' | 'note' | 'handoff' | 'contract' | 'source' | 'commit'

export interface AtlasNode {
  /** typed-prefixed stable id: `note:<project>/<topic>/<name>`, `project:<name>`, … */
  id: string
  type: AtlasNodeType
  label: string
  project?: string
  topic?: string
  date?: string
  /** precomputed DESIGN layout position — deterministic, renderer never lays out */
  x: number
  y: number
  /** note/handoff: vault-relative path (Reader open target) */
  path?: string
  /** note: frontmatter `type` chip; summary = objective or first body sentence
   *  (already authored — no generation step, ever) */
  noteType?: string
  summary?: string
  /** note freshness: stale renders rust per DESIGN token rules */
  stale?: boolean
  /** handoff stamp/route-line fields (mirrors the board card) */
  status?: string
  kind?: string
  from?: string
  to?: string
  expired?: boolean
  /** project cluster: open inbound count (gold badge) + contained note volume */
  openCount?: number
  noteCount?: number
  /** source: recorded provenance; localPath = this-machine re-resolution via the
   *  project-roots map first, recorded absolute path fallback; null = not local
   *  (renderer shows the honest disabled state + copy-path affordance) */
  sourcePath?: string
  sourceProject?: string
  sourceRel?: string
  localPath?: string | null
  /** commit: sha + normalized https commit-page base; null base = non-GitHub
   *  remote → plain mono text + copy-sha, no link (architecture-m2 §6) */
  sha?: string
  commitBase?: string | null
  /** contract: repo-relative file in a registered repo + change count */
  file?: string
  repoRoot?: string
  changeCount?: number
}

/** Exactly 6 edge categories (ATLAS-CONCEPT §2) — filtered at category level. */
export type AtlasEdgeCategory =
  | 'route'
  | 'thread'
  | 'wikilink'
  | 'provenance'
  | 'contract-link'
  | 'affinity'

export interface AtlasEdge {
  id: string
  /** node ids; edges whose endpoint is absent from the level are dropped */
  source: string
  target: string
  category: AtlasEdgeCategory
  /** route: the handoff node that created it (edge click = click that node),
   *  blocking = open/accepted request (expired snooze counts as open) */
  handoffId?: string
  status?: string
  kind?: string
  blocking?: boolean
  /** overview aggregation: `N open / M total` count badge */
  openCount?: number
  totalCount?: number
  /** thread: which frontmatter field made the edge */
  field?: 'replies_to' | 'fulfills'
  /** contract-link: m2 §5 tier VERBATIM — heuristic renders dashed --text-2 */
  confidence?: 'mentioned' | 'heuristic'
  /** affinity: the shared topic (the only computed category; weight = share) */
  topic?: string
  weight?: number
}

/** Topic folder container — explicit structure, no inference (ATLAS-CONCEPT §2). */
export interface AtlasTopicGroup {
  name: string
  nodeIds: string[]
  /** single-child groups are dissolved by the renderer (collapsed-atom rule) */
  singleChild: boolean
}

export interface AtlasCluster {
  project: string
  topics: AtlasTopicGroup[]
}

export interface AtlasGraph {
  level: AtlasLevel
  scope: AtlasScope
  nodes: AtlasNode[]
  edges: AtlasEdge[]
  clusters: AtlasCluster[]
  /** a route cycle was detected and broken deterministically — never a hang */
  cyclic: boolean
}

/** BFS shortest-path result (story 10.6, ATLAS-6) — rendered gold as a
 *  clickable routing-slip chain; null crosses the seam when disconnected. */
export interface AtlasPathResult {
  nodeIds: string[]
  edgeIds: string[]
}

/**
 * Tours (story 10.5, ATLAS-5): the interactive form of curate reading orders.
 * A tour is nothing more than an ordered list of (title, prose, nodeId[]) that
 * drives the same navigation primitives a user has — extracted from existing
 * truth (reading orders, threads, topic date-order), never generated.
 */
export type TourKind = 'reading-order' | 'thread' | 'topic'

export interface TourStep {
  title: string
  /** surrounding prose from the handoff body (reading-order line), or the
   *  step note's own authored summary — no generation step, ever */
  description: string
  /** atlas node ids highlighted by this step (first node = click resolution) */
  nodeIds: string[]
  /** owning project/topic of the first node — playback auto-opens the cluster */
  project?: string
  topic?: string
}

export interface TourDef {
  id: string
  kind: TourKind
  title: string
  description: string
  /** deterministic BFS fallback ordering used (handoff had no reading order) */
  heuristic: boolean
  project?: string
  /** topic tours: the topic walked (scope filtering) */
  topic?: string
  steps: TourStep[]
}

// ── Contract intelligence (epic 11 — architecture-m2.md §5, read-only) ──────

/** Registered project roots: absolute repo path → display name. Precedence is
 *  decided (m2 §5): loredex config.projects wins when its vaultPath matches the
 *  open vault; else the app-db `project_roots` setting; config is never
 *  written back. */
export type ProjectRootsMap = Record<string, { name: string }>

/** A contract↔handoff link with its confidence tier ALWAYS labeled (m2 §5).
 *  `mentioned` = commit sha appears in a handoff body/objective (solid chip);
 *  `heuristic` = same project + same calendar date (labeled, display-only —
 *  NEVER notifications or suggestions). */
export interface ContractLink {
  handoffId: string
  confidence: 'mentioned' | 'heuristic'
}

/**
 * One contract change on the timeline (story 11.1): a commit that touched a
 * matched contract file, from the app-db `contract_scan` cache. repoRoot +
 * project ride along (app-local contract evolution) so the diff channel and
 * the project filter need no second lookup.
 */
export interface ContractChange {
  /** absolute repo root the file lives in */
  repoRoot: string
  /** registered project name for that root */
  project: string
  /** repo-relative file path */
  file: string
  /** full 40-hex commit sha */
  sha: string
  /** committer date, ISO */
  date: string
  author: string
  subject: string
  /** numstat counts; null = git reported '-' (binary) or none */
  adds: number | null
  dels: number | null
  /** [] until story 11.3 computes the tiers */
  links: ContractLink[]
  /** story 12.1: this repo's normalized GitHub web base (from its real origin
   *  remote, core-derived + session-cached); null = non-GitHub/no remote —
   *  the commit chip renders plain mono text, never a broken URL */
  commitBase: string | null
}

/** One contract-scan change row (story 11.1's provider shape). The Atlas
 *  consumes it verbatim; until 11.1 ships the production provider is empty and
 *  contract nodes are simply absent (story 10.1 AC5 degradation). */
export interface AtlasContractChange {
  repoRoot: string
  file: string
  sha: string
  date: string
  /** registered project name (roots map) — lets a contract node's resolution
   *  open the timeline pre-scoped to its project (§3 hyperlink table) */
  project?: string
  links: Array<{ handoffId: string; confidence: 'mentioned' | 'heuristic' }>
}

// ── GitHub layer (epic 12 — architecture-m2.md §6, gh CLI only, no OAuth) ───

/** One PR from `gh pr list --json number,title,state,mergedAt,url` (story
 *  12.2). null crosses the seam when gh is absent/unauthenticated, the repo
 *  is not GitHub, no PR references the sha, or the 5 s lookup timed out —
 *  the chip degrades to a plain commit link, never an error. */
export interface PrInfo {
  url: string
  number: number
  title: string
  state: 'OPEN' | 'CLOSED' | 'MERGED'
  mergedAt: string | null
}

// ── Wizards (epic 13 — architecture-m2.md §7, paste-URL only, NO OAuth) ─────
// (v0.1 WizardInput/WizardResult + vault.createOrJoin removed by story 13.2 —
//  the three wizard channels below replace them, per m2 §7.)

export type WizardFlow = 'create' | 'join'

/** Step state for the modal's progress list. 'warn' = the step completed but
 *  said something the user must see (SCHEMA_AHEAD, identity unset on join). */
export type WizardStepStatus = 'running' | 'done' | 'warn' | 'failed'

/**
 * `git ls-remote` preflight result (story 13.1) — runs BEFORE any writes, so a
 * bad URL or missing credentials fails while the disk is still untouched.
 * `message` (app-local evolution over the m2 sketch) carries git's own words
 * when unreachable, for the details expander.
 */
export interface RemoteCheck {
  reachable: boolean
  /** true when the remote has no refs (safe to push a brand-new vault into) */
  empty: boolean
  /** from the HEAD symref advertisement; null when the remote doesn't say */
  defaultBranch: string | null
  message?: string
}

export interface CreateVaultResult {
  vaultPath: string
  remoteWired: boolean
}

export interface JoinVaultResult {
  vaultPath: string
  /** false = SCHEMA_AHEAD: the vault declares a newer loredex schema than this
   *  app supports — the join continued read-mostly with a loud warning */
  schemaOk: boolean
}

/**
 * Failure detail every wizard envelope carries (story 13.1 AC4): failures
 * after the scaffold step leave a valid LOCAL vault — the modal must say so
 * and offer opening it (remote wiring retries from Sync settings).
 */
export interface WizardFailureDetail {
  localVaultCreated: boolean
  /** raw git stderr/stdout for the details expander — never the headline */
  gitOutput?: string
}

// ── Collapsible rails (story 16.2, DESIGN.md Addendum D1) ───────────────────

/** Per-vault pane collapse state — UI pref, app.db only (never the vault). */
export interface RailsCollapsed {
  /** nav sidebar collapsed to the 56px icon rail */
  sidebar: boolean
  /** file-list pane collapsed to 0 (reader full-bleed) */
  list: boolean
}

// ── Vault tree sections (story 16.3, DESIGN.md Addendum D1) ─────────────────

/** Per-vault collapsed tree-section state — UI pref, app.db only. */
export interface TreeSectionsCollapsed {
  /** vault-relative paths of the collapsed section rows (groups + projects) */
  collapsed: string[]
}

// ── Edit mode + inline comments (story 16.4, DESIGN.md Addendum D1) ─────────

/**
 * One anchored inline comment on a note — a plain `type: comment` vault note
 * (annotate contract + `anchor`), surfaced for the reader's margin rail.
 * Non-anchored comments stay the thread rail's (story 8.2) — never duplicated.
 */
export interface NoteComment {
  /** vault-relative path of the comment note */
  path: string
  /** `Name <email>` from the `author` key, else the body attribution line */
  author: string
  /** ISO `created` timestamp when present, else the note's date */
  at: string
  /** the exact quoted text this comment anchors to */
  anchor: string
  /** the comment prose (contract scaffolding stripped) */
  body: string
}

// ── Duplicate-note detection (multi-actor curate collision) ─────────────────

/** One vault copy of a source note (see DuplicateGroup). */
export interface DuplicateCopy {
  /** vault-relative path of this copy */
  path: string
  /** the note's frontmatter date (YYYY-MM-DD) if any — newest-first sort key */
  date: string
  /** filesystem mtime ISO — tiebreaker + display */
  mtime: string
}

/** A set of vault notes that share one upstream source (filed twice by
 *  independent curate runs); copies[0] is the newest = the natural keep. */
export interface DuplicateGroup {
  /** the shared source identity (source_path, or source_project|source_rel) */
  key: string
  sourceProject: string
  sourceRel: string
  copies: DuplicateCopy[]
}
