/**
 * Local stubs for payload types not yet exported by the pinned loredex release.
 * Each stub is replaced by `import type { ... } from 'loredex'` when its lib PR
 * lands (marker below). App-local view types live here permanently.
 * Rule: never inline-duplicate these anywhere else (architecture.md#coding-standards #2).
 */

// ── loredex payload types (landed lib PRs re-exported; rest still stubbed) ──

/** (lib PR-1, PR-2, PR-4, PR-6 — landed, local file: dep) */
import type { Identity } from 'loredex'

export type { ActivityEvent, ConsumeReceipt, HandoffCard, Identity, SyncHealth } from 'loredex'

/** (lib PR-3) */
export interface RoutePreview {
  file: string
  destination: string
  project: string
  receiptId?: string
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
