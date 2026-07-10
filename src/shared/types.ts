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
  ConsumeReceipt,
  CreateHandoffInput,
  HandoffCard,
  HandoffCreateResult,
  HandoffTransition,
  Identity,
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
  /** display name: file basename without .md, or folder name */
  name: string
  /** vault-relative path (posix separators) */
  path: string
  kind: 'dir' | 'file'
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

export interface WizardInput {
  mode: 'create' | 'join'
  vaultPath: string
  remoteUrl?: string
}

export interface WizardResult {
  ok: boolean
  vaultPath: string
  message?: string
}
