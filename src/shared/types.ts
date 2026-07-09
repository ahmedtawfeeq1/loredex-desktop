/**
 * Local stubs for payload types not yet exported by the pinned loredex release.
 * Each stub is replaced by `import type { ... } from 'loredex'` when its lib PR
 * lands (marker below). App-local view types live here permanently.
 * Rule: never inline-duplicate these anywhere else (architecture.md#coding-standards #2).
 */

// ── loredex stubs (replaced by lib PRs) ─────────────────────────────────────

/** (lib PR-1) */
export interface HandoffCard {
  id: string
  name: string
  from: string
  to: string
  objective: string
  date: string
  status: string
  path: string
}

/** (lib PR-2) */
export interface Identity {
  name: string
  email: string
}

/** (lib PR-2) */
export interface ConsumeReceipt {
  id: string
  handoffId: string
  by: Identity
  at: string
}

/** (lib PR-3) */
export interface RoutePreview {
  file: string
  destination: string
  project: string
  receiptId?: string
}

/** (lib PR-4) */
export interface SyncHealth {
  state: 'ok' | 'behind' | 'dirty' | 'error'
  behind: number
  ahead: number
  lastSync?: string
  warnings: string[]
}

/** (lib PR-5) */
export interface SyncReport {
  pulled: number
  pushed: boolean
  warnings: string[]
}

/** (lib PR-6) */
export interface ActivityEvent {
  at: string
  kind: string
  who: string
  summary: string
  path?: string
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

export interface Facets {
  project?: string
  type?: string
  status?: string
}

export interface LinkResolution {
  link: string
  resolvedPath: string | null
  candidates: string[]
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
