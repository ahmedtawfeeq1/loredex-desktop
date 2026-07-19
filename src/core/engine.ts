/**
 * loredex lib facade — the SOLE `import 'loredex'` site (anti-second-engine,
 * architecture.md#coding-standards #3). Config resolves exactly once per
 * core-host lifetime (F6 split-brain defense); a respawned host re-resolves.
 */
import { execFile } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { basename, dirname, isAbsolute, join, normalize, sep } from 'node:path'
import { promisify } from 'node:util'
import {
  ACTIVITY_LOG_ARGS,
  type ActivityEvent,
  ambientGitIdentity,
  annotateHandoff,
  buildDashboard,
  type ClientInfo,
  parseActivity,
  type Config,
  copyWorkspaceSpec,
  type DexType,
  type LintFinding,
  type WorkspaceResult,
  lintAgentOps,
  loadDexType,
  loadWorkspaceSpec,
  materializeWorkspace,
  normalizeClient,
  productOf,
  scaffoldClient,
  scanFleet,
  windowsSafeCommand,
  workspaceEnvRefs,
  type HandoffTransition,
  type ConsumeReceipt,
  consumeHandoff,
  createHandoff,
  type CreateHandoffInput,
  createLoredexMcpServer,
  type Doc,
  ensureGeneratedMergeDriver,
  gitAutoCommit,
  gitPullPush,
  groupProjects,
  type HandoffCard,
  type HandoffCreateResult,
  HandoffError,
  type HandoffScope,
  type Identity,
  listHandoffs,
  listProjects,
  listReceipts,
  loadConfig,
  loadProducts,
  LOREDEX_SCHEMA,
  matchNeverRoute,
  type Meta,
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
  type RouteReceipt,
  RouteScopeError,
  RouteUndoError,
  saveConfig,
  scaffoldVault,
  type SearchHit,
  searchVault,
  serializeDoc,
  setHandoffStatus,
  slugify,
  stampEngineSchema,
  stampSchema,
  type StatusReceipt,
  type SyncHealth,
  syncStatus,
  undoRoute,
  type VaultSchemaStatus,
  vaultSchemaStatus,
  listWorkItems,
  updateWorkItem,
  type WorkItem,
  type WorkPatch,
  type WorkReceipt,
} from 'loredex'
import { abbreviatePath } from '../shared/identity'
import { type DuplicateGroup, findDuplicates, type NoteRecord } from './duplicates'
import { gitLog, withGitIdentity } from './git'
import { ipcError } from '../shared/ipc-contract'
import { applyFrontmatterEdit, spliceBody } from './notes'
import { listMarkdownFiles } from './tree'
import type {
  CreateClientSpec,
  HomeBrief,
  ReplyHandoffInput,
  VaultIdentity,
} from '../shared/types'

/** undefined = not yet initialized; null = initialized, no config on disk. */
let config: Config | null | undefined
let configSource: VaultIdentity['configSource'] = 'loredex-config'
/** The config file as loaded, BEFORE any picker override — the contract-root
 *  precedence check (m2 §5) needs the file's own vaultPath to compare. */
let fileConfig: Config | null = null

export function initEngine(vaultOverride?: string): Config | null {
  if (config !== undefined) {
    throw new Error('initEngine called twice — config resolves exactly once per core-host lifetime')
  }
  config = loadConfig()
  fileConfig = config
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

/**
 * The loredex config file's own vaultPath + projects map, pre-override (story
 * 11.1): contract-root precedence — config.projects wins only when non-empty
 * AND its vaultPath matches the open vault; it is never written back.
 */
export function configFileProjects(): { vaultPath: string; projects: Config['projects'] } | null {
  return fileConfig ? { vaultPath: fileConfig.vaultPath, projects: fileConfig.projects } : null
}

export function readNote(path: string): Doc {
  return parseDoc(readFileSync(resolveInVault(path), 'utf8'))
}

export function search(q: string, limit?: number): SearchHit[] {
  return searchVault(getConfig().vaultPath, q, limit === undefined ? {} : { limit }).filter(
    (h) => !/(^|\/)_archive\//.test(h.path),
  )
}

/** Parsed frontmatter of one note (facet narrowing, story 2.4) — read-only. */
export function noteMeta(absPath: string): Record<string, unknown> {
  return parseDoc(readFileSync(absPath, 'utf8')).meta as Record<string, unknown>
}

/**
 * Product grouping bound to this vault's manifest (`_index/products.json`) — the
 * function the tree view uses to nest Product → Project. Read-only lib call; the
 * loredex import stays fenced here (anti-second-engine).
 */
export function productGrouper(): (projects: string[]) => ReturnType<typeof groupProjects> {
  const map = loadProducts(getConfig().vaultPath)
  return (projects) => groupProjects(map, projects)
}

// ── agent-ops dexes (epic: clients view — read fresh per call, like productGrouper) ──

/** The open dex's declared type ('research' when absent — every pre-dex vault). */
export function getDexType(): DexType {
  return loadDexType(getConfig().vaultPath)
}

/** The manager (product) a project/client is filed under — `manager:` search facet. */
export function managerOf(project: string): string | null {
  return productOf(loadProducts(getConfig().vaultPath), project)
}

/** Fleet read model: every client with pipelines/agents/stages/tables/inbox. */
export function fleet(): ClientInfo[] {
  return scanFleet(getConfig().vaultPath)
}

/** Agent-ops lint findings (schema violations, drift, secrets) — read-only. */
export function agentOpsLints(): LintFinding[] {
  return lintAgentOps(getConfig().vaultPath).findings
}

/**
 * Generate (or check) a client's workspace files from workspace.yml. `env`
 * overlays process.env at expansion time — the handler passes this machine's
 * keychain tokens so materialize works without any shell environment.
 */
export function generateWorkspace(
  client: string,
  check: boolean,
  env?: Record<string, string>,
): WorkspaceResult {
  return materializeWorkspace(getConfig().vaultPath, client, {
    check,
    env: { ...process.env, ...env },
  })
}

/**
 * The desktop Add-Client verb (docs/plan/agent-ops-desktop-flow.md): scaffold
 * → copy golden tooling (env refs rewritten per slug) → materialize with the
 * caller's env overlay → reindex → ONE attributed commit. Tokens arrive as an
 * env-shaped record and only ever land in the gitignored generated files.
 */
export function createClient(
  spec: CreateClientSpec,
  tokens: Record<string, string>,
  identity: Identity,
): { slug: string; workspace: WorkspaceResult; tokenRefs: Record<string, string> } {
  const config = getConfig()
  const { slug } = scaffoldClient(config.vaultPath, spec.name, {
    manager: spec.manager,
    tags: spec.tags,
  })
  const renamed = spec.fromClient
    ? copyWorkspaceSpec(config.vaultPath, spec.fromClient, slug, { servers: spec.servers }).renamed
    : []
  // tokens arrive keyed by the GOLDEN client's ref names — the modal never has
  // to predict the new slug; the copy's rename map is the source of truth
  const tokenRefs: Record<string, string> = {}
  const env: Record<string, string> = {}
  for (const [ref, token] of Object.entries(tokens)) {
    const final = renamed.find((r) => r.from === ref)?.to ?? ref
    tokenRefs[ref] = final
    if (token) env[final] = token
  }
  const workspace = materializeWorkspace(config.vaultPath, slug, {
    env: { ...process.env, ...env },
  })
  rebuildIndexes(config.vaultPath)
  withGitIdentity(identity, () =>
    gitAutoCommit(config.vaultPath, config, `loredex: new client ${slug} (${identity.name})`),
  )
  return { slug, workspace, tokenRefs }
}

/** The `${VAR}` names a client's workspace.yml declares — the needs-token diff input. */
export function clientEnvRefs(client: string): string[] {
  return workspaceEnvRefs(join(getConfig().vaultPath, 'projects', client))
}

/** Generated tooling exists on this machine — drives the Wire vs Re-wire label. */
export function workspaceGenerated(client: string): boolean {
  return existsSync(join(getConfig().vaultPath, 'projects', client, '.mcp.json'))
}

/**
 * The dex's STANDARD tooling: the deduped union of connections across every
 * tooled client, each with the first client that declares it as its copy
 * source. An agency fleet is homogeneous — the UI asks for a token, never for
 * "which client to copy from"; the source is bookkeeping, resolved here.
 */
export function standardTooling(): Array<{ server: string; source: string; envRefs: string[] }> {
  const config = getConfig()
  const out = new Map<string, { server: string; source: string; envRefs: string[] }>()
  for (const slug of listProjects(config.vaultPath)) {
    let conns: ReturnType<typeof clientConnections>
    try {
      conns = clientConnections(slug)
    } catch {
      continue // no/invalid workspace.yml — not a tooling source
    }
    for (const c of conns) {
      if (!out.has(c.server)) out.set(c.server, { server: c.server, source: slug, envRefs: c.envRefs })
    }
  }
  return [...out.values()].sort((a, b) => a.server.localeCompare(b.server))
}

/**
 * Post-hoc tooling copy for an EXISTING client (the Add-Client copy, without
 * the scaffold): golden workspace.yml in, env refs rewritten, materialize with
 * the token overlay, reindex, one attributed commit (workspace.yml is vault
 * content). Same golden-keyed token contract as createClient.
 */
export function copyTooling(
  client: string,
  from: string,
  servers: string[] | undefined,
  tokens: Record<string, string>,
  identity: Identity,
): { workspace: WorkspaceResult; tokenRefs: Record<string, string> } {
  const config = getConfig()
  const { renamed } = copyWorkspaceSpec(config.vaultPath, from, client, { servers })
  const tokenRefs: Record<string, string> = {}
  const env: Record<string, string> = {}
  for (const [ref, token] of Object.entries(tokens)) {
    const final = renamed.find((r) => r.from === ref)?.to ?? ref
    tokenRefs[ref] = final
    if (token) env[final] = token
  }
  const workspace = materializeWorkspace(config.vaultPath, client, {
    env: { ...process.env, ...env },
  })
  rebuildIndexes(config.vaultPath)
  withGitIdentity(identity, () =>
    gitAutoCommit(
      config.vaultPath,
      config,
      `loredex: ${client} tooling from ${from} (${identity.name})`,
    ),
  )
  return { workspace, tokenRefs }
}

/**
 * A client's mcp connections with their launch config (env values still
 * `${VAR}`-refs — secret-free). Feeds the Add-Client modal checkboxes and the
 * connection health probe.
 */
export function clientConnections(client: string): Array<{
  server: string
  envRefs: string[]
  command: string
  args: string[]
  env: Record<string, string>
}> {
  const spec = loadWorkspaceSpec(join(getConfig().vaultPath, 'projects', client))
  const ENV_REF = /\$\{([A-Z0-9_]+)\}/g
  return Object.entries(spec.mcp).map(([server, def]) => {
    const refs = new Set<string>()
    for (const value of Object.values(def.env ?? {})) {
      for (const m of value.matchAll(ENV_REF)) refs.add(m[1] as string)
    }
    return {
      server,
      envRefs: [...refs].sort(),
      command: def.command,
      args: def.args ?? [],
      env: def.env ?? {},
    }
  })
}

/** Absolute path of a client's directory — the Open-in-Terminal target. */
export function clientDirAbs(client: string): string {
  return join(getConfig().vaultPath, 'projects', client)
}

/** cmd /c wrapper for npx-family shims on Windows — re-exported for the probe. */
export { windowsSafeCommand }

/**
 * Bring one client (or the whole fleet when `client` is omitted) up to the
 * canonical structure — folders, .gitkeep, starter pipeline/stage/agent —
 * then reindex + one attributed commit. Idempotent (lib normalizeClient).
 */
export function normalizeStructure(
  client: string | undefined,
  identity: Identity,
): { normalized: number } {
  const config = getConfig()
  const targets = client ? [client] : listProjects(config.vaultPath)
  let normalized = 0
  for (const slug of targets) {
    if (!normalizeClient(config.vaultPath, slug).alreadyCanonical) normalized++
  }
  if (normalized > 0) {
    rebuildIndexes(config.vaultPath)
    withGitIdentity(identity, () =>
      gitAutoCommit(
        config.vaultPath,
        config,
        client
          ? `loredex: normalize client ${client} (${identity.name})`
          : `loredex: normalize fleet structure — ${normalized} client(s) (${identity.name})`,
      ),
    )
  }
  return { normalized }
}

const RAW_EXTS = ['.yaml', '.yml', '.json', '.csv'] as const

/**
 * Raw read of a data file strictly inside the dex (yaml/json/csv allowlist).
 * resolveNoteInsideVault is md-only by design, so containment is enforced here:
 * realpath both sides, prefix check, extension allowlist. 2 MB cap — these are
 * settings exports and tables, not databases.
 */
export function readRawFile(path: string): { raw: string; fileType: 'yaml' | 'json' | 'csv' } {
  const vault = getConfig().vaultPath
  const requested = isAbsolute(path) ? path : join(vault, path)
  let vaultRoot: string
  let resolved: string
  try {
    vaultRoot = realpathSync(vault)
    resolved = realpathSync(requested)
  } catch {
    throw ipcError('VAULT_OUTSIDE_PATH', `not a readable file inside the dex: ${path}`)
  }
  const ext = RAW_EXTS.find((e) => resolved.endsWith(e))
  if (!ext || !resolved.startsWith(vaultRoot + sep)) {
    throw ipcError('VAULT_OUTSIDE_PATH', `not a data file inside the dex: ${path}`)
  }
  if (statSync(resolved).size > 2 * 1024 * 1024) {
    throw ipcError('INTERNAL', 'data file too large to preview (2 MB cap)')
  }
  const fileType = ext === '.csv' ? 'csv' : ext === '.json' ? 'json' : 'yaml'
  return { raw: readFileSync(resolved, 'utf8'), fileType }
}

/** Product dashboard compute (story 2.5) — read-only lib aggregation. */
export function dashboard(today: string): ProductDashboard {
  return buildDashboard(getConfig().vaultPath, today)
}

const execFileAsync = promisify(execFile)

/**
 * Re-curate a project's Start Here brief (story 2.6 — the re-curate seam made
 * real). curate is a CLI/LLM operation the lib doesn't expose and it can run
 * ~1min, so it must never block a window: we spawn the bundled loredex CLI in
 * the core host. cwd is the vault so the CLI's own loadConfig() resolves the
 * same projects map the app is showing. The CLI falls back to heuristics when
 * no `claude`/`codex` is installed, so this works regardless of LLM presence.
 * `-y` skips the confirm prompt; a failure throws with the CLI's stderr.
 */
export async function recurateProject(project: string): Promise<void> {
  // trust-boundary guard: `project` arrives over IPC and is spawned as a positional
  // arg to the loredex CLI. A value starting with '-' could smuggle a flag into the
  // CLI's arg parser, and '/' / '..' could escape the intended projects/<name> dir —
  // reject anything that isn't a plain path segment. First char must be
  // alphanumeric/underscore so a leading '-' (flag) or '.'/'..' (traversal) is
  // rejected outright.
  if (!/^[A-Za-z0-9_][A-Za-z0-9._-]*$/.test(project)) {
    throw new Error(`invalid project name: ${project}`)
  }
  const { vaultPath } = getConfig()
  const cliPath = join(
    dirname(createRequire(import.meta.url).resolve('loredex/package.json')),
    'dist',
    'cli.js',
  )
  // Commander sees process.versions.electron and (no defaultApp) treats
  // argv[1] — the script path — as the first USER arg, so the CLI reported
  // "unknown command …/cli.js" (user bug 2026-07-17). A tmp wrapper drops the
  // script entry from argv before importing the real CLI.
  // security: a fixed name in the shared tmpdir is symlink/TOCTOU-attackable —
  // mkdtemp gives a fresh 0700 dir, 'wx' refuses to follow anything pre-planted
  const wrapperDir = mkdtempSync(join(tmpdir(), 'loredex-'))
  const wrapperPath = join(wrapperDir, 'cli-wrapper.mjs')
  writeFileSync(
    wrapperPath,
    'if (process.versions.electron && !process.defaultApp) process.argv.splice(1, 1)\n' +
      'await import(process.env.LOREDEX_CLI_URL)\n',
    { flag: 'wx' },
  )
  try {
    await execFileAsync(process.execPath, [wrapperPath, 'curate', project, '-y'], {
      cwd: vaultPath,
      // Electron's binary runs as plain Node with this flag set (packaged + dev).
      env: {
        ...process.env,
        ELECTRON_RUN_AS_NODE: '1',
        LOREDEX_CLI_URL: pathToFileURL(cliPath).href,
      },
      maxBuffer: 32 * 1024 * 1024,
      timeout: 180_000,
    })
  } catch (e) {
    // surface the CLI's own words (it prints failures to stdout/stderr —
    // e.g. a vault-lock collision when two curates overlap), not the bare
    // "Command failed: <argv>" (user report 2026-07-18)
    const err = e as { stderr?: string; stdout?: string; message?: string }
    const detail =
      (err.stderr ?? '').trim().split('\n').slice(-4).join(' ') ||
      (err.stdout ?? '').trim().split('\n').slice(-4).join(' ')
    throw new Error(detail || err.message || String(e))
  } finally {
    rmSync(wrapperDir, { recursive: true, force: true })
  }
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

/** v3 Plan/Today (parity slices D/E): the lib's one work-item plane —
 *  tasks ∪ handoffs on board statuses (loredex ≥ 2.8). */
export function workItems(today: string): WorkItem[] {
  // _archive/ is out of the working set (2026-07-18)
  return listWorkItems(getConfig().vaultPath, today).filter(
    (i) => !/(^|\/)_archive\//.test(i.path),
  )
}

export function workUpdate(
  id: string,
  patch: WorkPatch,
  identity: Identity,
): WorkReceipt {
  return updateWorkItem(getConfig().vaultPath, getConfig(), id, patch, identity)
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

/**
 * Route one file into the vault (story 7.4) — lib routeFile, plan+execute in one
 * call. Now returns the PR-3 receiptId (epic4) so the host can offer Undo. A
 * never-route glob match throws RouteScopeError → mapped to ROUTE_BLOCKED.
 */
export function route(file: string, opts: RouteOptions): { written: string[]; receiptId?: string } {
  const config = getConfig()
  try {
    return routeFile(config.vaultPath, config, file, opts)
  } catch (e) {
    if (e instanceof RouteScopeError) {
      throw ipcError('ROUTE_BLOCKED', `routing blocked — ${file} matches never-route "${e.glob}"`)
    }
    throw e
  }
}

/**
 * Reverse a route by its receipt (epic4.story1/4.2, lib PR-3 undoRoute). Restores
 * byte-identical state and regenerates indexes; a superseded/missing receipt fails
 * loudly (never a silent no-op). Callers hold the write lock.
 */
export function routeUndo(receiptId: string): void {
  const config = getConfig()
  try {
    undoRoute(config.vaultPath, config, receiptId)
  } catch (e) {
    if (e instanceof RouteUndoError) {
      const code = e.code === 'ALREADY_UNDONE' ? 'ROUTE_ALREADY_UNDONE' : 'ROUTE_RECEIPT_NOT_FOUND'
      throw ipcError(code, e.message)
    }
    throw e
  }
}

/** Persisted route receipts, newest first (epic4.story2 history + dedup source). */
export function routeHistory(limit?: number): RouteReceipt[] {
  return listReceipts(getConfig().vaultPath, limit)
}

/** The matching never-route glob for `file`, or null (epic4.story3 blocked preview). */
export function scopeBlock(file: string): string | null {
  return matchNeverRoute(getConfig().neverRoute ?? [], file)
}

/** The configured never-route globs (epic4.story3). */
export function neverRouteGlobs(): string[] {
  return getConfig().neverRoute ?? []
}

/**
 * Persist never-route globs through the shared lib config (saveConfig) so the CLI
 * honors the same list (epic4.story3 — team-visible routing policy, never app-db).
 */
export function setNeverRoute(globs: string[]): void {
  const next: Config = { ...getConfig(), neverRoute: globs }
  saveConfig(next)
  config = next
}

/**
 * Drift check for a routed note (epic4.story4): resolve its source on THIS machine
 * (source_path, else source_project+source_rel through the registered projects) and
 * report stale when the live source body no longer matches the stamped source_hash.
 * Read-only — the one-click re-route WRITE goes through the lib plan/apply (route()).
 * A note with no resolvable source (move-routed, or source absent) is never stale.
 */
export function noteDrift(path: string): { stale: boolean; source?: string } {
  const abs = resolveInVault(path)
  const meta = parseDoc(readFileSync(abs, 'utf8')).meta as Record<string, unknown>
  const source = resolveNoteSource(meta, getConfig().projects)
  if (!source) return { stale: false }
  const stamped = meta.source_hash
  if (typeof stamped !== 'string') return { stale: false, source }
  const srcBody = parseDoc(readFileSync(source, 'utf8')).body
  return { stale: hashBodyLocal(srcBody) !== stamped, source }
}

/** Same identity the lib's router stamps (sha256 of the trimmed body). */
function hashBodyLocal(body: string): string {
  return createHash('sha256').update(body.trim()).digest('hex')
}

/** Where a routed note's source lives on this machine — mirrors the lib resolver. */
function resolveNoteSource(
  meta: Record<string, unknown>,
  projects: Config['projects'],
): string | null {
  const sp = meta.source_path
  if (typeof sp === 'string' && isAbsolute(sp) && existsSync(sp)) return sp
  const proj = meta.source_project
  const rel = meta.source_rel
  if (typeof proj === 'string' && typeof rel === 'string') {
    for (const [root, entry] of Object.entries(projects)) {
      if (slugify(entry.name) !== proj) continue
      const candidate = normalize(join(root, rel))
      if (candidate.startsWith(normalize(root)) && existsSync(candidate)) return candidate
    }
  }
  return null
}

/** Resolve a note path (rel or abs) strictly inside the vault, or throw. */
function resolveInVault(path: string): string {
  const vault = getConfig().vaultPath
  const requested = isAbsolute(path) ? path : join(vault, path)
  const resolved = resolveNoteInsideVault(vault, requested)
  if (!resolved) {
    throw ipcError('VAULT_OUTSIDE_PATH', `not a markdown note inside the vault: ${path}`)
  }
  return resolved
}

/**
 * Body-only note write (story 16.4, Addendum D1 edit mode): the original
 * frontmatter block is preserved byte-for-byte (agents own frontmatter — a
 * gray-matter round-trip would reformat it), the body is replaced, and the
 * edit lands as `loredex: edit <note> (<name>)`. Path guarded via the lib's
 * resolveNoteInsideVault; identity rides the commit (F7). Commit only —
 * pushing stays the poller/Sync-now's job.
 */
export function saveNoteBody(path: string, body: string, identity: Identity): { path: string } {
  const config = getConfig()
  const resolved = resolveInVault(path)
  const raw = readFileSync(resolved, 'utf8')
  writeFileSync(resolved, spliceBody(raw, body.endsWith('\n') ? body : `${body}\n`))
  withGitIdentity(identity, () =>
    gitAutoCommit(config.vaultPath, config, `loredex: edit ${basename(resolved, '.md')} (${identity.name})`),
  )
  return { path: resolved }
}

/**
 * Remove a note from the dex (user request 2026-07-17): archive moves it to
 * `_archive/<same relative path>` (out of every scan — walkers only read
 * projects/), delete removes the file. Both land as one attributed commit;
 * push stays the poller/Sync-now's job. Path guarded via resolveInVault.
 */
export function removeNote(
  path: string,
  mode: 'delete' | 'archive' | 'unarchive',
  identity: Identity,
): { path: string } {
  const config = getConfig()
  const resolved = resolveInVault(path)
  const vault = config.vaultPath
  const rel = resolved.slice(vault.length + 1)
  if (mode === 'unarchive') {
    // back to its original home: strip the _archive/ prefix (user 2026-07-18)
    const cleanRel = rel.replace(/^(_archive\/)+/, '')
    const dest = join(vault, cleanRel)
    if (resolved !== dest) {
      mkdirSync(dirname(dest), { recursive: true })
      renameSync(resolved, dest)
    }
  } else if (mode === 'archive') {
    // idempotent: archiving an already-archived note must never nest
    // _archive/_archive/… (user bug 2026-07-18) — strip leading segments
    const cleanRel = rel.replace(/^(_archive\/)+/, '')
    const dest = join(vault, '_archive', cleanRel)
    if (resolved === dest) return { path: rel } // already exactly there
    mkdirSync(dirname(dest), { recursive: true })
    renameSync(resolved, dest)
  } else {
    unlinkSync(resolved)
  }
  withGitIdentity(identity, () =>
    gitAutoCommit(
      vault,
      config,
      `loredex: ${mode} ${basename(resolved, '.md')} (${identity.name})`,
    ),
  )
  return { path: rel }
}

/**
 * Duplicate notes filed twice by independent curate runs (multi-actor
 * collision). Read-only: walks the vault, keys each note by its provenance
 * frontmatter, returns groups with 2+ copies (see duplicates.ts).
 */
export function listDuplicates(): DuplicateGroup[] {
  const { vaultPath } = getConfig()
  const notes: NoteRecord[] = []
  for (const rel of listMarkdownFiles(vaultPath)) {
    const abs = join(vaultPath, rel)
    try {
      notes.push({ path: rel, meta: noteMeta(abs), mtime: statSync(abs).mtime.toISOString() })
    } catch {
      // unreadable or removed mid-walk — skip, it can't be a live duplicate
    }
  }
  return findDuplicates(notes)
}

/**
 * Delete the given vault-relative notes and commit once. Each path is guarded
 * through resolveNoteInsideVault (no traversal); identity rides the commit (F7).
 * Commit only — pushing stays the poller/Sync-now's job.
 */
export function removeNotes(paths: string[], identity: Identity): { removed: string[] } {
  const config = getConfig()
  const removed: string[] = []
  for (const p of paths) {
    unlinkSync(resolveInVault(p))
    removed.push(p)
  }
  if (removed.length > 0) {
    const n = removed.length
    withGitIdentity(identity, () =>
      gitAutoCommit(config.vaultPath, config, `loredex: remove ${n} duplicate note${n === 1 ? '' : 's'}`),
    )
  }
  return { removed }
}

/**
 * Frontmatter property write (epic20, D1 amendment 7 §C): set or remove ONE
 * user-owned frontmatter key on an existing note. The body is preserved (it
 * round-trips through the lib's parseDoc → serializeDoc unchanged); the
 * frontmatter block is re-serialized because it is exactly what changed.
 * Managed keys are rejected in applyFrontmatterEdit (agents own frontmatter).
 * Path guarded via resolveNoteInsideVault; identity rides the commit (F7).
 * Commit only — pushing stays the poller/Sync-now's job.
 */
export function setFrontmatter(
  path: string,
  key: string,
  value: unknown,
  remove: boolean,
  identity: Identity,
): { path: string; body: string } {
  const config = getConfig()
  const resolved = resolveInVault(path)
  const doc = parseDoc(readFileSync(resolved, 'utf8'))
  const nextMeta = applyFrontmatterEdit(doc.meta as Record<string, unknown>, key, value, remove)
  writeFileSync(resolved, serializeDoc({ meta: nextMeta as Meta, body: doc.body }))
  const verb = remove ? 'remove' : 'set'
  withGitIdentity(identity, () =>
    gitAutoCommit(
      config.vaultPath,
      config,
      `loredex: ${verb} property ${key} on ${basename(resolved, '.md')}`,
    ),
  )
  return { path: resolved, body: doc.body }
}

/**
 * Anchored inline comment (story 16.4): a NEW `type: 'comment'` note beside
 * the parent — the lib annotateHandoff frontmatter/body contract extended
 * with `anchor` (the exact quoted text), `author` and `created`, so agents
 * read it natively via CLI/MCP. Works for ANY vault note; the parent is
 * never mutated. Commit only (pushed: false) — sync pushes later.
 */
export function createNoteComment(
  path: string,
  input: { anchor: string; body: string },
  identity: Identity,
): HandoffCreateResult {
  const config = getConfig()
  const vault = config.vaultPath
  const resolved = resolveInVault(path)
  const parentName = basename(resolved, '.md')
  const dir = dirname(resolved)
  const rel = resolved.slice(vault.length + 1)
  const project = /^projects\/([^/]+)\//.exec(rel)?.[1]
  const segments = rel.split('/')
  const topic = project && segments.length > 3 ? (segments[2] as string) : 'comments'
  const today = new Date().toISOString().slice(0, 10)
  const author = `${identity.name} <${identity.email}>`

  const meta = stampSchema({
    ...(project ? { project } : {}),
    topic,
    type: 'comment',
    date: today,
    replies_to: parentName,
    anchor: input.anchor,
    author,
    created: new Date().toISOString(),
    source: 'loredex',
    loredex: 'routed',
  } as Meta)
  const body = [
    `# Comment on ${parentName}`,
    '',
    `On [[${parentName}]]:`,
    '',
    `> ${input.anchor.replace(/\n/g, '\n> ')}`,
    '',
    input.body.trim(),
    '',
    `— ${author}`,
  ].join('\n')

  let dest = join(dir, `${today}-comment-${slugify(input.anchor)}.md`)
  for (let i = 2; existsSync(dest); i += 1) {
    dest = join(dir, `${today}-comment-${slugify(input.anchor)}-${i}.md`)
  }
  writeFileSync(dest, serializeDoc({ meta, body: `${body}\n` }))
  stampEngineSchema(vault)
  rebuildIndexes(vault)
  withGitIdentity(identity, () =>
    gitAutoCommit(vault, config, `loredex: comment on ${parentName}`),
  )
  return { id: basename(dest, '.md'), path: dest, pushed: false }
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

// ── Wizard wrappers (stories 13.1/13.2): lib calls at an EXPLICIT path — the
//    wizards run against a vault that is not the once-resolved config (there
//    may be no config at all on first run). Vault writes stay lib exports. ───

/** Fresh read of the loredex config file — the wizard merges onto the file's
 *  own truth (editor, projects map survive), never the picker override. */
export function readConfigFile(): Config | null {
  return loadConfig()
}

/** Write the loredex config file (lib saveConfig) — CLI/agents on this machine
 *  see the same vault the wizard just made (m2 §7 "register"). */
export function writeConfigFile(next: Config): void {
  saveConfig(next)
}

/** Scaffold the dex skeleton + `.loredex/engine.json` stamp (lib export). */
export function scaffoldNewVault(path: string, dexType: DexType = 'research'): void {
  scaffoldVault(path, dexType)
}

/** Wire the generated-index merge driver into a repo at an explicit path. */
export function ensureMergeDriverAt(vaultPath: string): void {
  ensureGeneratedMergeDriver(vaultPath)
}

/** Read-only sync snapshot at an explicit path (wizard step 6 — pre-pivot). */
export function syncHealthAt(vaultPath: string): SyncHealth {
  return syncStatus(vaultPath)
}

/** Schema handshake at an explicit path (join step 4 — the clone, pre-pivot). */
export function schemaStatusAt(vaultPath: string): VaultSchemaStatus {
  return vaultSchemaStatus(vaultPath)
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
