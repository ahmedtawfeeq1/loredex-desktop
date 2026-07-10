/**
 * loredex lib facade — the SOLE `import 'loredex'` site (anti-second-engine,
 * architecture.md#coding-standards #3). Config resolves exactly once per
 * core-host lifetime (F6 split-brain defense); a respawned host re-resolves.
 */
import { readFileSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir } from 'node:os'
import { isAbsolute, join } from 'node:path'
import {
  ACTIVITY_LOG_ARGS,
  type ActivityEvent,
  ambientGitIdentity,
  annotateHandoff,
  buildDashboard,
  parseActivity,
  type Config,
  type HandoffTransition,
  type ConsumeReceipt,
  consumeHandoff,
  createHandoff,
  type CreateHandoffInput,
  createLoredexMcpServer,
  type Doc,
  gitPullPush,
  type HandoffCard,
  type HandoffCreateResult,
  HandoffError,
  type HandoffScope,
  type Identity,
  listHandoffs,
  loadConfig,
  LOREDEX_SCHEMA,
  parseDoc,
  previewRoute,
  PRODUCT_BRIEF_NAME,
  type ProductDashboard,
  rebuildIndexes,
  renderDashboardMarkdown,
  replyToHandoff,
  resolveNoteInsideVault,
  routeFile,
  type RouteOptions,
  type RoutePlanPreview,
  type SearchHit,
  searchVault,
  setHandoffStatus,
  type StatusReceipt,
  type SyncHealth,
  syncStatus,
  type VaultSchemaStatus,
  vaultSchemaStatus,
} from 'loredex'
import { abbreviatePath } from '../shared/identity'
import { gitLog, withGitIdentity } from './git'
import { ipcError } from '../shared/ipc-contract'
import type { HomeBrief, ReplyHandoffInput, VaultIdentity } from '../shared/types'

/** undefined = not yet initialized; null = initialized, no config on disk. */
let config: Config | null | undefined
let configSource: VaultIdentity['configSource'] = 'loredex-config'

export function initEngine(vaultOverride?: string): Config | null {
  if (config !== undefined) {
    throw new Error('initEngine called twice — config resolves exactly once per core-host lifetime')
  }
  config = loadConfig()
  if (vaultOverride) {
    config = { ...(config ?? { sync: 'none' as const, projects: {} }), vaultPath: vaultOverride }
    configSource = 'vault-picker'
  }
  return config
}

export function getConfig(): Config {
  if (config === undefined) throw new Error('engine not initialized')
  if (config === null) {
    throw ipcError('NO_CONFIG', 'no loredex config resolved — pick a vault first (story 1.4)')
  }
  return config
}

export function readNote(path: string): Doc {
  const vault = getConfig().vaultPath
  const requested = isAbsolute(path) ? path : join(vault, path)
  const resolved = resolveNoteInsideVault(vault, requested)
  if (!resolved) {
    throw ipcError('VAULT_OUTSIDE_PATH', `not a markdown note inside the vault: ${path}`)
  }
  return parseDoc(readFileSync(resolved, 'utf8'))
}

export function search(q: string, limit?: number): SearchHit[] {
  return searchVault(getConfig().vaultPath, q, limit === undefined ? {} : { limit })
}

/** Parsed frontmatter of one note (facet narrowing, story 2.4) — read-only. */
export function noteMeta(absPath: string): Record<string, unknown> {
  return parseDoc(readFileSync(absPath, 'utf8')).meta as Record<string, unknown>
}

/** Product dashboard compute (story 2.5) — read-only lib aggregation. */
export function dashboard(today: string): ProductDashboard {
  return buildDashboard(getConfig().vaultPath, today)
}

/**
 * The Start Here brief for the home view (story 2.5): the file as curated when
 * it exists (freshness = its mtime); otherwise the deterministic dashboard
 * sections rendered live — read-only either way, no vault write.
 */
export function homeBrief(): HomeBrief {
  const { vaultPath } = getConfig()
  const abs = join(vaultPath, PRODUCT_BRIEF_NAME)
  try {
    const mtime = statSync(abs).mtime.toISOString()
    return {
      path: PRODUCT_BRIEF_NAME,
      markdown: parseDoc(readFileSync(abs, 'utf8')).body,
      mtime,
      generated: false,
    }
  } catch {
    const today = new Date().toISOString().slice(0, 10)
    return {
      path: null,
      markdown: renderDashboardMarkdown(dashboard(today), today),
      mtime: null,
      generated: true,
    }
  }
}

/** All handoffs in scope (story 3.2) — lib collector, never app-side note parsing. */
export function handoffs(scope: HandoffScope): HandoffCard[] {
  return listHandoffs(getConfig().vaultPath, scope)
}

/** Registered project names from the resolved config ("my projects" — story 3.7 filter). */
export function registeredProjects(): string[] {
  return [...new Set(Object.values(getConfig().projects).map((p) => p.name))]
}

/**
 * Consume a handoff (story 3.4) — THE lib writer; the app never touches
 * handoff frontmatter itself. Identity rides the git commands it triggers
 * (per-command injection, never ambient config — F7/NFR11).
 */
export function consume(id: string, identity: Identity): ConsumeReceipt {
  const config = getConfig()
  return withGitIdentity(identity, () => consumeHandoff(config.vaultPath, config, id, identity))
}

/**
 * Lib HandoffError → typed envelope (AMBIGUOUS_HANDOFF / UNKNOWN_HANDOFF /
 * ILLEGAL_TRANSITION). Lives here because engine.ts is the only module allowed
 * to know loredex classes; other errors pass through (dispatcher → INTERNAL).
 */
function mapHandoffError<T>(fn: () => T): T {
  try {
    return fn()
  } catch (e) {
    if (e instanceof HandoffError) throw ipcError(e.code, e.message)
    throw e
  }
}

/** Compose a handoff (story 7.2) — the lib's one create writer, verbatim brief, NO LLM. */
export function composeHandoff(input: CreateHandoffInput, identity: Identity): HandoffCreateResult {
  const config = getConfig()
  return mapHandoffError(() =>
    withGitIdentity(identity, () => createHandoff(config.vaultPath, config, input, identity)),
  )
}

/** Reply to a handoff (story 7.3) — lib sugar inverts the route + sets replies_to. */
export function reply(
  parentId: string,
  input: ReplyHandoffInput,
  identity: Identity,
): HandoffCreateResult {
  const config = getConfig()
  return mapHandoffError(() =>
    withGitIdentity(identity, () =>
      replyToHandoff(config.vaultPath, config, parentId, input, identity),
    ),
  )
}

/** Comment on a handoff (story 7.3) — a NEW type:'comment' note; parent never mutated. */
export function annotate(
  id: string,
  comment: { title: string; body: string },
  identity: Identity,
): HandoffCreateResult {
  const config = getConfig()
  return mapHandoffError(() =>
    withGitIdentity(identity, () => annotateHandoff(config.vaultPath, config, id, comment, identity)),
  )
}

/**
 * Lifecycle transition (story 8.1) — the lib's one non-consume status writer
 * (accept/decline/snooze/reopen). Legality is lib-enforced; illegal transitions
 * surface as ILLEGAL_TRANSITION envelopes, never silent.
 */
export function setStatus(
  id: string,
  transition: HandoffTransition,
  identity: Identity,
): StatusReceipt {
  const config = getConfig()
  return mapHandoffError(() =>
    withGitIdentity(identity, () =>
      setHandoffStatus(config.vaultPath, config, id, transition, identity),
    ),
  )
}

/** The board card a create landed as; null for comments (never board cards). */
export function handoffCard(id: string): HandoffCard | null {
  return listHandoffs(getConfig().vaultPath, { direction: 'all' }).find((c) => c.id === id) ?? null
}

/** Read-only route plan for the confirm card (story 7.4) — lib previewRoute, no writes. */
export function routePlan(file: string, opts: RouteOptions): RoutePlanPreview {
  return previewRoute(getConfig().vaultPath, file, opts)
}

/** Route one file into the vault (story 7.4) — lib routeFile, plan+execute in one call. */
export function route(file: string, opts: RouteOptions): { written: string[] } {
  const config = getConfig()
  return routeFile(config.vaultPath, config, file, opts)
}

/** Read-only sync health snapshot (story 5.2) — lib syncStatus, never fetches. */
export function syncHealth(): SyncHealth {
  return syncStatus(getConfig().vaultPath)
}

/**
 * Pull+push the vault repo (story 5.2) — THE lib sync writer. Callers hold the
 * write lock and inject identity per command (withGitIdentity), never ambient.
 */
export function pullPush(): { pulled: boolean; pushed: boolean } {
  return gitPullPush(getConfig().vaultPath)
}

/** Vault schema vs this engine (story 5.2 handshake, NFR8) — lib check. */
export function schemaStatus(): VaultSchemaStatus {
  return vaultSchemaStatus(getConfig().vaultPath)
}

/** Lib parseDoc for out-of-tree content (story 9.1: remote refs via git show). */
export function parseMarkdown(raw: string): Doc {
  return parseDoc(raw)
}

/**
 * Rebuild generated indexes from filesystem truth (story 9.1 post-integrate
 * reconcile, F4 rule). A vault write — callers hold the write lock.
 */
export function rebuildVaultIndexes(): void {
  rebuildIndexes(getConfig().vaultPath)
}

/**
 * Activity feed (story 6.2): the vault's git log through the lib's one
 * activity grammar — zero app-side commit-message parsing. Recomputed cache:
 * derived fresh from git truth on every call, never persisted.
 */
export function activityFeed(opts: { since?: string; limit?: number } = {}): ActivityEvent[] {
  const { vaultPath } = getConfig()
  const args: string[] = [...ACTIVITY_LOG_ARGS, '-n', String(opts.limit ?? 200)]
  if (opts.since) args.push(`--since=${opts.since}`)
  let log: string
  try {
    log = gitLog(vaultPath, args)
  } catch (e) {
    throw ipcError(
      'GIT_FAILED',
      'could not read the vault git history — is this vault a git repository?',
      e instanceof Error ? e.message : String(e),
    )
  }
  return parseActivity(log)
}

/** The vault repo's git config identity — the settings form's default. */
export function ambientIdentity(): Identity {
  return ambientGitIdentity(getConfig().vaultPath)
}

/**
 * The lib MCP server over the once-resolved config (story 1.6) — the same
 * factory the CLI stdio host uses: two hosts, zero duplicated tool logic.
 */
export function createMcpServer(): ReturnType<typeof createLoredexMcpServer> {
  return createLoredexMcpServer(getConfig())
}

/** Vault frontmatter schema this engine writes — discovery-file schemaVersion. */
export function schemaVersion(): number {
  return LOREDEX_SCHEMA
}

/** Embedded engine version — read from the loredex package itself (F6 evidence). */
export function engineVersion(): string {
  const pkg = createRequire(import.meta.url)('loredex/package.json') as { version: string }
  return pkg.version
}

/** Read-only peek at <vault>/.git/config for the origin remote url (no git shell-out). */
function readOriginRemote(vaultPath: string): string | null {
  try {
    const raw = readFileSync(join(vaultPath, '.git', 'config'), 'utf8')
    const origin = /\[remote "origin"\][^[]*?url\s*=\s*(\S+)/.exec(raw)
    return origin?.[1] ?? null
  } catch {
    return null
  }
}

/** Vault identity for the chrome badge; later echoed by MCP responses (story 1.6). */
export function identity(): VaultIdentity {
  const { vaultPath } = getConfig()
  return {
    vaultPath,
    displayPath: abbreviatePath(vaultPath, homedir()),
    configSource,
    remote: readOriginRemote(vaultPath),
    engineVersion: engineVersion(),
  }
}
