/**
 * Registers the CoreApi handlers implemented so far onto the dispatcher.
 * Unregistered channels answer NOT_IMPLEMENTED from the dispatcher itself.
 */
import { execFile } from 'node:child_process'
import { isFontSettings } from '../shared/font-settings'
import { toVaultRelative } from '../shared/handoff-lanes'
import { isValidIdentity } from '../shared/identity'
import { isThemeSetting } from '../shared/theme'
import { type CoreEvent, ipcError, type MainControlMessage } from '../shared/ipc-contract'
import type {
  HandoffCard,
  Identity,
  NoteComment,
  ProjectRootsMap,
  SyncReport,
} from '../shared/types'
import * as engine from './engine'
import { atlasGraph, atlasPath, atlasTours, invalidateAtlas } from './atlas'
import { readClientTokens, storeClientToken } from './client-tokens'
import {
  capDiff,
  computeLinks,
  diffArgs,
  handoffNoteViews,
  isCommitSha,
  loadContractGlobs,
  loadProjectRoots,
  type NewContractRow,
  resolveRoots,
  saveContractGlobs,
  saveProjectRoots,
  scanContracts,
  timelineWithLinks,
} from './contracts'
import { appSettingGet, appSettingSet, getAppDb, setPollCursor, vaultId } from './db/index'
import { getReadState, markRead } from './db/read-state'
import { reconcileSnoozeTimers } from './db/snooze'
import { aggregateFacetValues, clearFacetCache, filterHits } from './facets'
import { gitAsync, gitCloneStreaming, gitCredentialEnv, NON_INTERACTIVE_GIT_ENV, setGitCredentialToken, withGitIdentity } from './git'
import {
  dismissKey,
  ghCapability,
  initGhCapability,
  prForCommit,
  remoteWebBase,
  suggestFromFreshChanges,
} from './github'
import type { CoreIpc } from './ipc'
import { invalidateLinkIndex, resolveLink } from './links'
import { commentView } from './notes'
import {
  getMcpStatus,
  loredexToolNames,
  mcpRequestLog,
  PREFERRED_MCP_PORT,
  restartMcpServer,
} from './mcp-server'
import {
  CLAUDE_LAUNCH_COMMAND,
  N8N_SKILLS_COMMAND,
  N8N_SKILLS_PLUGIN,
  hasPluginInstalled,
  hasTerminalN8nMcp,
  terminalN8nCommand,
} from './claude-plugins'
import { probeStdioTools } from './mcp-tools'
import { clearN8nKey, n8nEnv, n8nStatus, setN8nKey, setN8nUrl } from './n8n-config'
import { installN8nMcp, n8nEntryPath, n8nInstallCommand } from './n8n-install'
import { workspaceServerRows } from './workspace-rows'
import {
  authStatus,
  createDexRepo,
  deleteToken,
  deviceFlowPoll,
  deviceFlowStart,
  listDexRepos,
  storedToken,
  storeToken,
  validateToken,
} from './auth'
import { createHandoffNotifier, type HandoffNotifier } from './notify'
import {
  acpCancel,
  acpContinue,
  acpPermission,
  acpPrompt,
  acpSetMode,
  acpStart,
  acpStop,
  deriveClientSlug,
} from './acp'
import { agentKeyStatus, clearAgentKey, storeAgentKey } from './agent-keys'
import {
  deleteConversation,
  listConversations,
  loadConversation,
  renameConversation,
} from './agent-conversations'
import {
  loadAgentPanelPrefs,
  loadAtlasLegendSeen,
  loadFontSettings,
  loadIdentityProfile,
  loadListPaneWidth,
  loadRailsCollapsed,
  loadTerminalPrefs,
  loadThemeSetting,
  loadTreeSectionsCollapsed,
  saveAtlasLegendSeen,
  saveFontSettings,
  saveIdentityProfile,
  saveAgentPanelPrefs,
  saveListPaneWidth,
  saveMcpPortOverride,
  saveRailsCollapsed,
  saveTerminalPrefs,
  saveThemeSetting,
  saveTreeSectionsCollapsed,
  loadAgentTokens,
  mintAgentToken,
  revokeAgentToken,
  loadMcpAutostart,
  loadMcpPortOverride,
  loadMcpWriteTools,
  saveMcpAutostart,
  saveMcpWriteTools,
  loadOrCreateMcpToken,
  loadPermissionRules,
  setPermissionRule,
  removePermissionRule,
  loadWorkspaceEnabled,
  setWorkspaceEnabled,
} from './settings'
import { termCreate, termInput, termKill, termResize } from './terminals'
import { buildThread, collectComments } from './threads'
import { groupProjectsInTree, listMarkdownFiles, walkVault } from './tree'
import { createVault, joinVault, validateRemote, type WizardDeps } from './wizard'
import { withWriteLock } from './write-lock'
import {
  deleteCredential,
  listCredentials,
  revealCredential,
  setCredential,
} from './client-credentials'

/**
 * Refuse an agent-ops-only write when the open dex isn't agent-ops (research).
 * The renderer already gates these on ClientPage/ClientsView (agent-ops only),
 * but a stale view after an in-place vault switch must never scaffold/normalize/
 * snapshot onto a research dex — the hard research-dex-safety invariant. Core is
 * the last line: throw before any lib call runs.
 */
function requireAgentOps(action: string): void {
  if (engine.getDexType() !== 'agent-ops') {
    throw ipcError('INTERNAL', `${action} applies to agent-ops dexes only`)
  }
}

/** WP-C: `YYYY-MM-DD_HHMMSS` local-time stamp = the snapshot dir name. The clock
 *  lives host-side (`stampNow` isn't lib-exported; handlers never import loredex). */
function stampNow(): string {
  const d = new Date()
  const p = (n: number): string => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}${p(
    d.getMinutes(),
  )}${p(d.getSeconds())}`
}

/**
 * Story 12.2 (AC3): evaluate freshly-scanned contract changes for status
 * suggestions — both scan paths feed it (the on-demand contracts.timeline
 * scan here, the post-integrate scan in core/index.ts). Read-only: it emits
 * suggest.statusChange events and writes nothing; Apply is the user's click
 * on the ordinary writer channels. Fire-and-forget, never blocks a caller.
 */
export function runSuggestionScan(
  emit: (event: CoreEvent) => void,
  fresh: readonly NewContractRow[],
): void {
  if (fresh.length === 0) return
  const db = getAppDb()
  if (!db) return
  let vid: string
  let cards: HandoffCard[]
  try {
    const id = engine.identity()
    vid = vaultId(id.vaultPath, id.remote)
    cards = engine.handoffs({ direction: 'all' })
  } catch {
    return // no config (picker pending) — nothing to suggest
  }
  const notes = handoffNoteViews(cards, (abs) => {
    try {
      return engine.readNote(abs).body
    } catch {
      return null
    }
  })
  const links = computeLinks(fresh, notes)
  void suggestFromFreshChanges(
    {
      emit,
      cards: () => cards,
      myProjects: () => {
        try {
          return engine.registeredProjects()
        } catch {
          return []
        }
      },
      linksFor: (sha) => links.get(sha) ?? [],
      isDismissed: (handoffId, sha) => appSettingGet(db, vid, dismissKey(handoffId, sha)) !== null,
      prFor: (repoRoot, sha) => prForCommit(repoRoot, sha, { db }),
    },
    fresh,
  ).catch(() => {
    // gh flaking mid-scan is not this app's problem — next scan re-evaluates
  })
}

export function registerCoreHandlers(
  ipc: CoreIpc,
  // story 3.7: display requests travel core → main; tests default to a no-op
  postToMain: (msg: MainControlMessage) => void = () => {},
  // story 9.1: mutable hooks filled in AFTER wiring (the poller needs the
  // notifier this function returns) — a manual sync resets the poll clock
  hooks: { onSyncRun?: () => void } = {},
): HandoffNotifier {
  // v0.1 has no poller — the notification/badge check rides every refresh action
  const notifier = createHandoffNotifier({
    listAll: () => engine.handoffs({ direction: 'all' }),
    myProjects: () => engine.registeredProjects(),
    vaultPath: () => engine.getConfig().vaultPath,
    post: postToMain,
    emit: (event) => ipc.emit(event),
  })

  ipc.register('config.get', () => engine.getConfig())
  ipc.register('app.identity', () => engine.identity())
  ipc.register('vault.readNote', ({ path }) => engine.readNote(path))
  ipc.register('vault.tree', () => {
    // the manual refresh re-walks the tree — rebuild the link index, facet
    // cache and atlas with it, and run the new-handoff check (story 3.7)
    invalidateLinkIndex()
    clearFacetCache()
    invalidateAtlas()
    notifier.refresh()
    // group the projects/ subtree Product → Project → Topic → Note (flat when
    // no products are defined) — the grouper reads the vault's product manifest.
    // Agent-ops dexes also list yaml/json/csv (tables, exports, action files).
    const agentOps = engine.getDexType() === 'agent-ops'
    return groupProjectsInTree(
      walkVault(engine.getConfig().vaultPath, '', {
        dataFiles: agentOps,
        includeEmpty: agentOps, // empty dirs are schema on agent-ops dexes
      }),
      engine.productGrouper(),
    )
  })
  // agent-ops dexes (clients view): fleet/lints are pure reads off the fs;
  // workspace generation writes only gitignored files (never vault content)
  ipc.register('vault.dexInfo', () => ({ type: engine.getDexType() }))
  ipc.register('vault.readRaw', ({ path }) => engine.readRawFile(path))
  ipc.register('clients.fleet', () => engine.fleet())
  ipc.register('clients.lints', () => engine.agentOpsLints())
  ipc.register('clients.workspace', ({ client, check }) => engine.generateWorkspace(client, check))
  // Add-Client (docs/plan/agent-ops-desktop-flow.md): tokens land in the OS
  // keychain FIRST, then one lib write op scaffolds + copies the golden
  // tooling + materializes with the keychain env — never a token in git.
  ipc.register('clients.create', ({ spec, tokens, identity }) =>
    withWriteLock(async () => {
      if (!isValidIdentity(identity)) {
        throw ipcError('INTERNAL', 'adding a client needs an identity — set name and email in Settings')
      }
      const { slug, workspace, tokenRefs } = engine.createClient(spec, tokens, identity)
      // keychain AFTER the copy — tokens are stored under the REWRITTEN ref
      // names (the ones the new client's workspace.yml actually declares)
      for (const [ref, token] of Object.entries(tokens)) {
        if (token) await storeClientToken(tokenRefs[ref] ?? ref, token)
      }
      invalidateAtlas()
      ipc.emit({ kind: 'vault.changed', paths: [`projects/${slug}`] })
      notifier.refresh()
      return { slug, workspace }
    }),
  )
  // Per-machine wiring state: declared ${VAR} refs vs keychain + file drift.
  ipc.register('clients.workspace.status', async ({ client }) => {
    const declaredRefs = engine.clientEnvRefs(client)
    const held = await readClientTokens(declaredRefs)
    const missingRefs = declaredRefs.filter((r) => !(r in held))
    const connections = engine.clientConnections(client)
    const check = engine.generateWorkspace(client, true, held)
    return {
      hasTooling: connections.length > 0,
      declaredRefs,
      missingRefs,
      drift: check.wouldChange.length > 0,
      generated: engine.workspaceGenerated(client),
    }
  })
  // Paste/replace tokens on THIS machine + re-materialize. Only the keychain
  // and gitignored generated files change — no commit, but the write lock
  // still serializes against the poller's pull.
  ipc.register('clients.tokens.set', ({ client, tokens }) =>
    withWriteLock(async () => {
      for (const [ref, token] of Object.entries(tokens)) {
        if (token) await storeClientToken(ref, token)
      }
      const held = await readClientTokens(engine.clientEnvRefs(client))
      return engine.generateWorkspace(client, false, held)
    }),
  )
  ipc.register('clients.connections', ({ client }) => engine.clientConnections(client))
  ipc.register('clients.standardTooling', () => engine.standardTooling())
  ipc.register('clients.normalize', ({ client, identity }) =>
    withWriteLock(() => {
      requireAgentOps('normalize') // never scaffold client structure onto a research dex
      if (!isValidIdentity(identity)) {
        throw ipcError('INTERNAL', 'normalizing needs an identity — set name and email in Settings')
      }
      const result = engine.normalizeStructure(client, identity)
      if (result.normalized > 0) {
        invalidateAtlas()
        ipc.emit({ kind: 'vault.changed', paths: client ? [`projects/${client}`] : ['projects'] })
        notifier.refresh()
      }
      return result
    }),
  )
  // Post-hoc tooling copy: an existing client (created with an empty workspace)
  // gets the golden client's connections + tokens — no hand-edited YAML.
  ipc.register('clients.tooling.copy', ({ client, from, servers, tokens, identity }) =>
    withWriteLock(async () => {
      if (!isValidIdentity(identity)) {
        throw ipcError('INTERNAL', 'copying tooling needs an identity — set name and email in Settings')
      }
      const { workspace, tokenRefs } = engine.copyTooling(client, from, servers, tokens, identity)
      for (const [ref, token] of Object.entries(tokens)) {
        if (token) await storeClientToken(tokenRefs[ref] ?? ref, token)
      }
      invalidateAtlas()
      ipc.emit({ kind: 'vault.changed', paths: [`projects/${client}`] })
      notifier.refresh()
      return workspace
    }),
  )
  // Health probe: spawn the connection's mcp server with keychain-expanded env
  // and complete an initialize handshake. 8s budget — inside the invoke limit.
  ipc.register('clients.connections.test', async ({ client, server }) => {
    const conn = engine.clientConnections(client).find((c) => c.server === server)
    if (!conn) throw ipcError('INTERNAL', `no connection "${server}" in ${client}/workspace.yml`)
    const held = await readClientTokens(conn.envRefs)
    const env = { ...process.env }
    const unexpanded: string[] = []
    for (const [key, value] of Object.entries(conn.env)) {
      env[key] = value.replace(/\$\{([A-Z0-9_]+)\}/g, (whole, ref: string) => {
        const token = held[ref]
        if (token === undefined) unexpanded.push(ref)
        return token ?? whole
      })
    }
    if (unexpanded.length > 0) {
      return { ok: false, detail: `missing token: ${unexpanded.join(', ')}` }
    }
    // Windows can't spawn the npx shim directly (ENOENT) — same cmd /c wrap the
    // generated .mcp.json uses, so the probe matches what `claude` will run.
    const safe = engine.windowsSafeCommand(conn.command, conn.args)
    return await new Promise<{ ok: boolean; detail: string }>((resolve) => {
      const child = execFile(safe.command, safe.args, {
        env,
        cwd: engine.clientDirAbs(client),
        timeout: 9000,
      })
      let stderr = ''
      let settled = false
      const done = (r: { ok: boolean; detail: string }): void => {
        if (settled) return
        settled = true
        child.kill()
        resolve(r)
      }
      const timer = setTimeout(() => done({ ok: false, detail: 'no response within 9s' }), 9000)
      timer.unref?.()
      child.stderr?.on('data', (d: Buffer | string) => {
        stderr += String(d)
        // fail fast on the common bridge patterns instead of burning the budget
        if (/auth failed|401|unauthorized|invalid token/i.test(stderr)) {
          done({ ok: false, detail: stderr.trim().split('\n').pop() ?? 'auth failed' })
        }
      })
      child.stdout?.on('data', (d: Buffer | string) => {
        if (String(d).includes('"result"')) done({ ok: true, detail: 'initialize ok' })
      })
      child.on('error', (e) => done({ ok: false, detail: e.message }))
      child.on('exit', (code) =>
        done({
          ok: false,
          detail: stderr.trim().split('\n').pop() ?? `exited with code ${code}`,
        }),
      )
      child.stdin?.write(
        `${JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2024-11-05',
            capabilities: {},
            clientInfo: { name: 'loredex-desktop-probe', version: '0' },
          },
        })}\n`,
      )
    })
  })
  // The terminal-free bridge: drop the teammate exactly where `claude` runs.
  // "Open in Terminal" opens the IN-APP terminal drawer at this dir (renderer
  // side); the core just resolves the absolute path cross-platform.
  ipc.register('clients.dirAbs', ({ client }) => ({ dir: engine.clientDirAbs(client) }))
  // BL-19: read-only note history — the reader's before/after Changes panel
  ipc.register('note.diff', ({ path }) => engine.noteDiff(path))
  // ── Workspace MCP servers (2026-07-20 spec) ───────────────────────────────
  ipc.register('workspace.mcp.list', () => workspaceServerRows(loadWorkspaceEnabled(), n8nStatus()))
  ipc.register('workspace.mcp.setEnabled', ({ id, on }) => setWorkspaceEnabled(id, on))
  ipc.register('workspace.mcp.tools', async ({ id }) => {
    if (id === 'loredex') {
      // ours — a throwaway in-process instance, mirroring the live write-tools
      // switch, so no spawn and no drift from what a session actually gets
      const names = loredexToolNames(loadMcpWriteTools())
      return { ok: true, tools: names, detail: `${names.length} tools` }
    }
    const entry = n8nEntryPath()
    if (!entry) return { ok: false, tools: [], detail: 'not installed' }
    // 6s, not the 9s default: a wedged server costs timeoutMs + ~2s of SDK
    // shutdown grace, and this blocks a Settings spinner. n8n-mcp starts in
    // 430ms–1.1s, so 6s is ample headroom without an ~11s stare.
    return await probeStdioTools(
      process.execPath,
      [entry],
      {
        ...n8nEnv(),
        ELECTRON_RUN_AS_NODE: '1',
        PATH: process.env.PATH ?? '',
        HOME: process.env.HOME ?? '',
      },
      6000,
    )
  })
  ipc.register('workspace.mcp.install', async () => {
    const res = await installN8nMcp()
    return { ...res, command: n8nInstallCommand() }
  })
  ipc.register('workspace.n8n.get', () => n8nStatus())
  ipc.register('workspace.n8n.set', async ({ url, key }) => {
    if (url !== undefined) setN8nUrl(url)
    if (key !== undefined) {
      if (key === null || key === '') await clearN8nKey()
      else await setN8nKey(key)
    }
  })
  ipc.register('workspace.skills.status', () => ({
    installed: hasPluginInstalled(N8N_SKILLS_PLUGIN),
    command: N8N_SKILLS_COMMAND,
    plugin: N8N_SKILLS_PLUGIN,
    launch: CLAUDE_LAUNCH_COMMAND,
    terminal: {
      // now a direct ~/.claude.json read (see hasTerminalN8nMcp), so it is
      // instant and answers on load — no more "not checked yet" state
      installed: hasTerminalN8nMcp(engine.getConfig().vaultPath),
      // n8nStatus().url is NOT secret; the key is a placeholder in the command
      command: terminalN8nCommand(n8nStatus().url),
    },
  }))
  ipc.register('workspace.terminal.check', () => ({
    // `claude mcp add` registers PROJECT-scoped by default, keyed by the cwd it
    // ran in — which is the vault, since that is where the card sends the user
    installed: hasTerminalN8nMcp(engine.getConfig().vaultPath),
  }))
  // WP-C: snapshot a pipeline/agent into _versions/<unit>/<stamp>/ (agent-ops).
  // One attributed commit under the write lock; the stamp is minted here (the
  // clock lives host-side, not in the lib). A fresh Versions list is the
  // renderer's cue to refetch.
  ipc.register('clients.snapshot.create', ({ client, unit, tables, note, identity }) =>
    withWriteLock(() => {
      requireAgentOps('snapshot')
      if (!isValidIdentity(identity)) {
        throw ipcError('INTERNAL', 'a snapshot commit needs an identity — set name and email in Settings')
      }
      const result = engine.createSnapshot(client, unit, stampNow(), identity, {
        includeTables: tables,
        note,
      })
      ipc.emit({ kind: 'vault.changed', paths: [`projects/${client}`] })
      return result
    }),
  )
  ipc.register('clients.snapshot.list', ({ client }) => engine.listSnapshotsFor(client))
  // WP-D: per-client login credentials — machine-local keychain only, never the
  // dex/git. No write lock, no vault.changed (nothing in the vault changes).
  ipc.register('clients.credentials.list', ({ client }) => listCredentials(client))
  ipc.register('clients.credentials.set', ({ client, id, label, username, secret, url, note }) =>
    setCredential(client, { id, label, username, secret, url, note }),
  )
  ipc.register('clients.credentials.delete', ({ client, id }) => deleteCredential(client, id))
  ipc.register('clients.credentials.reveal', ({ client, id }) => revealCredential(client, id))
  // WP-G: scaffold new units + consume the inbox — each write clones the
  // clients.normalize discipline (lock + identity + atlas + vault.changed +
  // notifier); inbox.list is a bare read.
  const scaffold =
    <T>(client: string, identity: Identity, run: () => T): Promise<T> =>
      withWriteLock(() => {
        requireAgentOps('this')
        if (!isValidIdentity(identity)) {
          throw ipcError('INTERNAL', 'this needs an identity — set name and email in Settings')
        }
        const result = run()
        invalidateAtlas()
        ipc.emit({ kind: 'vault.changed', paths: [`projects/${client}`] })
        notifier.refresh()
        return result
      })
  ipc.register('clients.scaffold.pipeline', ({ client, name, identity }) =>
    scaffold(client, identity, () => engine.scaffoldPipelineUnit(client, name, identity)),
  )
  ipc.register('clients.scaffold.agent', ({ client, name, identity }) =>
    scaffold(client, identity, () => engine.scaffoldAgentUnit(client, name, identity)),
  )
  ipc.register('clients.scaffold.stage', ({ client, pipeline, name, before, after, identity }) =>
    scaffold(client, identity, () =>
      engine.scaffoldStageUnit(client, pipeline, name, { before, after }, identity),
    ),
  )
  ipc.register('clients.inbox.list', ({ client }) => engine.clientInbox(client))
  ipc.register('clients.inbox.toRandoms', ({ client, name, identity }) =>
    scaffold(client, identity, () => engine.moveInboxToRandoms(client, name, identity)),
  )
  ipc.register('clients.inbox.delete', ({ client, name, identity }) =>
    scaffold(client, identity, () => engine.deleteInboxItem(client, name, identity)),
  )
  // Vault Atlas (story 10.1): the whole derived graph, memoized core-side —
  // same recomputed-cache tier as the link index (never authoritative).
  ipc.register('atlas.graph', ({ level, scope }) => atlasGraph(level, scope ?? {}))
  // Tours (story 10.5): extracted from reading orders/threads/topics — same
  // recomputed-cache tier and invalidation as the graph itself.
  ipc.register('atlas.tours', ({ scope }) => atlasTours(scope ?? {}))
  // Path tracing (story 10.6): BFS in the core host — the graph lives here.
  ipc.register('atlas.path', ({ from, to }) => atlasPath(from, to))
  ipc.register('vault.resolveLink', ({ link, from }) =>
    resolveLink(engine.getConfig().vaultPath, link, from),
  )
  // ACP file-refs (acp Phase 1 A2): agent tool paths are ABSOLUTE — the reader
  // opens by vault-relative path. Same mapping the handoff/route writers use.
  ipc.register('vault.relativize', ({ path }) => ({
    rel: toVaultRelative(path, engine.getConfig().vaultPath),
  }))
  // full-text ranking is the lib's searchVault; facets narrow by frontmatter
  // app-side (story 2.4). Wider limit so narrowing has material to work on.
  ipc.register('vault.search', ({ q, facets }) =>
    filterHits(engine.search(q, 50), facets, engine.noteMeta, engine.managerOf),
  )
  ipc.register('vault.facets', () => {
    const vaultPath = engine.getConfig().vaultPath
    return aggregateFacetValues(vaultPath, listMarkdownFiles(vaultPath), engine.noteMeta)
  })
  // duplicate-note detection + cleanup (multi-actor curate collision)
  ipc.register('vault.duplicates', () => engine.listDuplicates())
  // delete + commit; the vault watcher catches the unlink and reconciles
  // (caches, tree, badge) + emits vault.changed for the renderer to refetch.
  ipc.register('vault.dedupe', ({ paths, identity }) => engine.removeNotes(paths, identity))
  // vault_id: computed once per vault open = once per core-host lifetime (the
  // host restarts on vault switch). Null while no config/db (picker pending).
  let cachedVaultId: string | null = null
  const currentVaultId = (): string | null => {
    if (cachedVaultId) return cachedVaultId
    try {
      const id = engine.identity()
      cachedVaultId = vaultId(id.vaultPath, id.remote)
    } catch {
      return null
    }
    return cachedVaultId
  }
  ipc.register('handoffs.list', ({ scope, project }) => {
    // every board fetch doubles as the new-handoff check (story 3.7)
    const all = notifier.refresh()
    // story 9.2 AC4: board load reconciles snooze timers from frontmatter truth
    const db = getAppDb()
    const vid = currentVaultId()
    if (db && vid) reconcileSnoozeTimers(db, vid, all)
    if (!project) return all // company-wide: direction is ignored without a project
    return engine.handoffs({ direction: scope, project })
  })
  // M2 read-state (story 9.2): per-user, app.db only — never the vault. No db
  // (bare test host) degrades to "everything unread" / mark as no-op.
  ipc.register('readState.get', ({ paths }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (!db || !vid) return Object.fromEntries(paths.map((p) => [p, null]))
    return getReadState(db, vid, paths)
  })
  ipc.register('readState.mark', ({ paths }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (db && vid && paths.length > 0) markRead(db, vid, paths)
  })
  // M2 contract intelligence (story 11.1): read-only, app-side, derived +
  // app-db cache — no vault writes, so core-host code, never lib (m2 §5).
  const contractRoots = (): {
    roots: ProjectRootsMap
    fromConfig: boolean
    globs: string[]
  } => {
    const db = getAppDb()
    const vid = currentVaultId()
    return {
      ...resolveRoots({
        openVaultPath: engine.getConfig().vaultPath,
        fileConfig: engine.configFileProjects(),
        appRoots: db && vid ? loadProjectRoots(db, vid) : null,
      }),
      globs: db && vid ? loadContractGlobs(db, vid) : [],
    }
  }
  ipc.register('contracts.timeline', async ({ project }) => {
    const db = getAppDb()
    if (!db) return [] // bare test host — no cache, honest empty timeline
    const { roots, globs } = contractRoots()
    // on-demand incremental scan (only since the newest cached sha per file),
    // then the merged cache with link tiers derived fresh (story 11.3 — the
    // tier is ALWAYS labeled; nothing about links is persisted)
    const fresh = await scanContracts({ db, roots, userGlobs: globs, git: gitAsync })
    // story 12.2: new rows may reference open handoffs — suggest, never write
    runSuggestionScan((e) => ipc.emit(e), fresh)
    const notes = handoffNoteViews(engine.handoffs({ direction: 'all' }), (abs) => {
      try {
        return engine.readNote(abs).body
      } catch {
        return null
      }
    })
    // story 12.1: each row carries its repo's real-origin GitHub base (one
    // derivation — core/github.ts — session-cached per repo)
    return timelineWithLinks(db, roots, notes, project, remoteWebBase)
  })
  // Story 11.2: one commit's unified diff — `git show <sha> -- <file>` pinned
  // to the commit (never the worktree), 200 KB cap with a visible flag. The
  // repoRoot must be a registered root: git only ever runs where the user
  // (or their config) pointed the app.
  ipc.register('contracts.diff', async ({ repoRoot, file, sha }) => {
    const { roots } = contractRoots()
    if (!(repoRoot in roots)) {
      throw ipcError('INTERNAL', 'that folder is not a registered project root — add it in Settings')
    }
    if (!isCommitSha(sha)) {
      throw ipcError('INTERNAL', `not a commit hash: ${sha}`)
    }
    return capDiff(await gitAsync(repoRoot, diffArgs(sha, file)))
  })
  const requireDb = (): { db: NonNullable<ReturnType<typeof getAppDb>>; vid: string } => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (!db || !vid) {
      throw ipcError('INTERNAL', 'no app database — restart the app, then set this again')
    }
    return { db, vid }
  }
  ipc.register('settings.projectRoots.get', () => {
    const { roots, fromConfig } = contractRoots()
    return { roots, fromConfig }
  })
  ipc.register('settings.projectRoots.set', ({ roots }) => {
    const { db, vid } = requireDb()
    saveProjectRoots(db, vid, roots) // app-db only — config.json is never written
  })
  ipc.register('settings.contractGlobs.get', () => ({ globs: contractRoots().globs }))
  ipc.register('settings.contractGlobs.set', ({ globs }) => {
    const { db, vid } = requireDb()
    saveContractGlobs(db, vid, globs)
  })
  // M2 GitHub layer (story 12.2): PR lookup via gh only — capability-gated,
  // 5 s timeout, per-sha session cache; null degrades to the plain link. The
  // repoRoot must be a registered project root or the vault itself (git/gh
  // only ever run where the user pointed the app — same rule as contracts.diff).
  ipc.register('github.prForCommit', async ({ repoRoot, sha }) => {
    if (!isCommitSha(sha)) {
      throw ipcError('INTERNAL', `not a commit hash: ${sha}`)
    }
    const { roots } = contractRoots()
    if (!(repoRoot in roots) && repoRoot !== engine.getConfig().vaultPath) {
      throw ipcError('INTERNAL', 'that folder is not a registered project root — add it in Settings')
    }
    return prForCommit(repoRoot, sha, { db: getAppDb() })
  })
  // gh capability for the Settings hint row (app-local contract evolution);
  // refresh=true is the m2 §6 "re-checked on settings change" path.
  ipc.register('github.capability', async ({ refresh }) => ({
    gh: refresh ? await initGhCapability(getAppDb()) : ghCapability(getAppDb()),
  }))
  // Suggestion dismissal (story 12.2 AC4): persisted per vault — never re-fires.
  ipc.register('suggest.dismiss', ({ handoffId, sha }) => {
    const { db, vid } = requireDb()
    appSettingSet(db, vid, dismissKey(handoffId, sha), new Date().toISOString())
  })
  // Consume is a lib write op: write lock (3.5 shim) + per-command git identity.
  ipc.register('handoffs.consume', ({ id, identity }) =>
    withWriteLock(() => {
      if (!isValidIdentity(identity)) {
        throw ipcError('INTERNAL', 'consume needs an identity — set name and email in Settings')
      }
      const receipt = engine.consume(id, identity)
      const rel = toVaultRelative(receipt.path, engine.getConfig().vaultPath)
      invalidateAtlas() // stamp flips before any renderer refetch can land
      ipc.emit({ kind: 'handoff.stateChanged', id, from: 'open', to: 'consumed', by: identity })
      ipc.emit({ kind: 'vault.changed', paths: [rel] })
      notifier.refresh() // badge drops immediately (story 3.7 AC3)
      return receipt
    }),
  )
  // M2 handoff writers (stories 7.2/7.3): every one is a lib write op — write
  // lock + per-command identity; the new note is announced as handoff.created
  // (card for board optimistic insert; null for comments) + vault.changed.
  const requireIdentity = (identity: Identity, verb: string): void => {
    if (!isValidIdentity(identity)) {
      throw ipcError('INTERNAL', `${verb} needs an identity — set name and email in Settings`)
    }
  }
  const announceCreated = (result: { id: string; path: string }): void => {
    // a new note exists — the link index must see it NOW (thread edges, story
    // 8.2, resolve through it before any renderer tree refresh lands)
    invalidateLinkIndex(engine.getConfig().vaultPath)
    invalidateAtlas()
    const rel = toVaultRelative(result.path, engine.getConfig().vaultPath)
    ipc.emit({ kind: 'handoff.created', card: engine.handoffCard(result.id), relPath: rel })
    ipc.emit({ kind: 'vault.changed', paths: [rel] })
    notifier.refresh()
  }
  ipc.register('handoffs.create', ({ input, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, 'publishing a handoff')
      const result = engine.composeHandoff(input, identity)
      announceCreated(result)
      return result
    }),
  )
  ipc.register('handoffs.reply', ({ parentId, input, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, 'replying')
      const result = engine.reply(parentId, input, identity)
      announceCreated(result)
      return result
    }),
  )
  // Lifecycle v2 (story 8.1): accept/decline/snooze/reopen — one lib write op.
  // The stateChanged event carries reason/until so boards can toast the detail.
  ipc.register('handoffs.setStatus', ({ id, transition, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, 'a status change')
      const receipt = engine.setStatus(id, transition, identity)
      const rel = toVaultRelative(receipt.path, engine.getConfig().vaultPath)
      invalidateAtlas() // stamp flips before any renderer refetch can land
      ipc.emit({
        kind: 'handoff.stateChanged',
        id,
        from: String(receipt.before.status ?? 'open'),
        to: String(receipt.after.status ?? ''),
        by: identity,
        ...(transition.to === 'declined' ? { reason: transition.reason } : {}),
        ...(transition.to === 'snoozed' ? { until: transition.until } : {}),
      })
      ipc.emit({ kind: 'vault.changed', paths: [rel] })
      notifier.refresh()
      return receipt
    }),
  )
  ipc.register('handoffs.annotate', ({ id, title, body, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, 'commenting')
      if (!title.trim() || !body.trim()) {
        throw ipcError('INTERNAL', 'a comment needs a title and a body')
      }
      const result = engine.annotate(id, { title, body }, identity)
      announceCreated(result)
      return result
    }),
  )
  // Edit mode (story 16.4, Addendum D1): body-only write to an existing note —
  // frontmatter preserved byte-for-byte (agents own it), path guarded by the
  // lib's resolveNoteInsideVault, committed as `loredex: edit <note> (<name>)`.
  ipc.register('note.save', ({ path, body, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, 'editing a note')
      const result = engine.saveNoteBody(path, body, identity)
      const vaultPath = engine.getConfig().vaultPath
      const rel = toVaultRelative(result.path, vaultPath)
      // body text changed — wikilinks/facets/atlas derive from it (F4 tier)
      invalidateLinkIndex(vaultPath)
      clearFacetCache()
      invalidateAtlas()
      ipc.emit({ kind: 'vault.changed', paths: [rel] })
      return { path: rel }
    }),
  )
  // Properties panel (epic20, D1 amendment 7 §C): set/remove one user-owned
  // frontmatter key. Body preserved, managed keys rejected in the engine
  // (agents own frontmatter), path guarded, committed as the identity (F7).
  ipc.register('note.setFrontmatter', ({ path, key, value, remove, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, 'editing a property')
      const result = engine.setFrontmatter(path, key, value, remove ?? false, identity)
      const vaultPath = engine.getConfig().vaultPath
      const rel = toVaultRelative(result.path, vaultPath)
      // frontmatter drives facets/atlas/links (F4 tier) — invalidate like a save
      invalidateLinkIndex(vaultPath)
      clearFacetCache()
      invalidateAtlas()
      ipc.emit({ kind: 'vault.changed', paths: [rel] })
      return { path: rel }
    }),
  )
  // Remove a note (user request 2026-07-17): archive → _archive/, delete →
  // gone; one attributed commit either way. Everything re-derives on change.
  ipc.register('vault.removeNote', ({ path, mode, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, `${mode.replace(/e$/, '')}ing a note`)
      const result = engine.removeNote(path, mode, identity)
      const vaultPath = engine.getConfig().vaultPath
      invalidateLinkIndex(vaultPath)
      clearFacetCache()
      invalidateAtlas()
      ipc.emit({ kind: 'vault.changed', paths: [result.path] })
      return result
    }),
  )
  // Inline comments (story 16.4): a NEW anchored type:'comment' note beside
  // the parent — the parent is never mutated; comments are never board cards.
  ipc.register('note.comment.create', ({ path, anchor, body, identity }) =>
    withWriteLock(() => {
      requireIdentity(identity, 'commenting')
      if (!anchor.trim() || !body.trim()) {
        throw ipcError('INTERNAL', 'a comment needs anchored text and a body')
      }
      const result = engine.createNoteComment(path, { anchor, body }, identity)
      announceCreated(result)
      return result
    }),
  )
  // Anchored comments replying to one note (story 16.4) — read-only scan,
  // derived fresh per request (recomputed-cache tier, nothing persisted).
  ipc.register('note.comments', ({ path }) => {
    const vaultPath = engine.getConfig().vaultPath
    const name = (path.split('/').pop() ?? path).replace(/\.md$/, '')
    const comments: NoteComment[] = []
    for (const rel of listMarkdownFiles(vaultPath)) {
      if (rel === path) continue
      try {
        const doc = engine.readNote(rel)
        const view = commentView(doc.meta as Record<string, unknown>, doc.body, name)
        if (view) comments.push({ path: rel, ...view })
      } catch {
        // unreadable note — reader diagnostics own that story, not the rail
      }
    }
    return comments.sort((a, b) =>
      a.at === b.at ? a.path.localeCompare(b.path) : a.at.localeCompare(b.at),
    )
  })
  // Thread graph (story 8.2): derived read — listHandoffs + comment scan +
  // the story 2.2 shortest-path resolver; nothing persisted, no lock.
  ipc.register('handoffs.thread', ({ id }) => {
    const vaultPath = engine.getConfig().vaultPath
    const cards = engine.handoffs({ direction: 'all' })
    const cardPaths = new Set(cards.map((c) => toVaultRelative(c.path, vaultPath)))
    const comments = collectComments(listMarkdownFiles(vaultPath), cardPaths, (rel) => {
      const doc = engine.readNote(rel)
      return { meta: doc.meta as Record<string, unknown>, body: doc.body }
    })
    const thread = buildThread(
      {
        vaultPath,
        cards,
        comments,
        resolveName: (name) => {
          const r = resolveLink(vaultPath, name, '')
          return r.status === 'resolved' ? (r.target ?? null) : null
        },
      },
      id,
    )
    if (!thread) throw ipcError('UNKNOWN_HANDOFF', `no handoff named "${id}" in this vault`)
    return thread
  })
  // Route-a-note (story 7.4). Preview is read-only (no lock); route is a lib
  // write op. The picker/drop is the user's consent for that ONE file (NFR12).
  const guardRouteSource = (file: string): void => {
    if (!file.endsWith('.md')) {
      throw ipcError('INTERNAL', 'only markdown files can be routed — pick a .md file')
    }
    if (toVaultRelative(file, engine.getConfig().vaultPath) !== file) {
      throw ipcError(
        'VAULT_OUTSIDE_PATH',
        'this file already lives inside the vault — routing is for working files outside it',
      )
    }
  }
  ipc.register('route.preview', ({ file, mode, projectName }) => {
    guardRouteSource(file)
    // epic4.story3: a never-route match short-circuits with a named-glob
    // explanation BEFORE the confirm card ever opens — never a silent skip.
    const blocked = engine.scopeBlock(file)
    if (blocked) {
      throw ipcError('ROUTE_BLOCKED', `routing blocked — this file matches never-route "${blocked}"`)
    }
    const plan = engine.routePlan(file, { mode, ...(projectName ? { projectName } : {}) })
    return {
      file,
      destination: plan.destination,
      project: String((plan.meta as Record<string, unknown>).project ?? ''),
      meta: plan.meta as Record<string, unknown>,
    }
  })
  ipc.register('route.file', ({ path, mode, projectName }) =>
    withWriteLock(() => {
      guardRouteSource(path)
      const opts = { mode, ...(projectName ? { projectName } : {}) }
      const profile = loadIdentityProfile()
      const result = profile
        ? withGitIdentity(profile, () => engine.route(path, opts))
        : engine.route(path, opts)
      const vaultPath = engine.getConfig().vaultPath
      const written = result.written[0]
      if (written) {
        ipc.emit({
          kind: 'route.completed',
          receipt: {
            file: path,
            destination: written,
            project: String(engine.noteMeta(written).project ?? ''),
            meta: engine.noteMeta(written),
          },
          ...(result.receiptId ? { receiptId: result.receiptId } : {}),
        })
      }
      ipc.emit({
        kind: 'vault.changed',
        paths: result.written.map((w) => toVaultRelative(w, vaultPath)),
      })
      return result
    }),
  )
  // epic4.story2: reverse a route by its receipt (lib PR-3 undoRoute) under the
  // write lock; identity rides the undo commit exactly like the route did.
  ipc.register('route.undo', ({ receiptId }) =>
    withWriteLock(() => {
      const profile = loadIdentityProfile()
      if (profile) withGitIdentity(profile, () => engine.routeUndo(receiptId))
      else engine.routeUndo(receiptId)
      ipc.emit({ kind: 'vault.changed', paths: [] })
    }),
  )
  ipc.register('route.history', ({ limit }) => engine.routeHistory(limit))
  ipc.register('settings.neverRoute.get', () => ({ globs: engine.neverRouteGlobs() }))
  ipc.register('settings.neverRoute.set', ({ globs }) => {
    engine.setNeverRoute(globs)
  })
  ipc.register('vault.drift', ({ path }) => engine.noteDrift(path))
  // Product home (story 2.5). dashboard.build is the re-curate seam — it runs
  // in the core host so a long build never blocks a window; story 2.6 hooks
  // its post-build snapshot here (callback point, not implemented in v0.1).
  ipc.register('dashboard.build', () => engine.dashboard(new Date().toISOString().slice(0, 10)))
  // ~1min CLI job — never inside the 10s invoke window (user bug 2026-07-18):
  // returns immediately, the recurate.done event closes the loop.
  ipc.register('dashboard.recurate', ({ project }) => {
    void engine
      .recurateProject(project)
      .then(() => ipc.emit({ kind: 'recurate.done', project, ok: true }))
      .catch((e) =>
        ipc.emit({
          kind: 'recurate.done',
          project,
          ok: false,
          error: e instanceof Error ? e.message : String(e),
        }),
      )
    return { started: true as const }
  })
  // Embedded terminal (terminal-splits blueprint): ptys are core-owned OS
  // resources; output rides CoreEvents (term.data/term.exit). NEVER log pty
  // data. No withWriteLock (ptys don't touch the vault), no identity.
  ipc.register('term.create', ({ cwd, cols, rows }) =>
    termCreate((e) => ipc.emit(e), { cwd: cwd ?? engine.getConfig().vaultPath, cols, rows }),
  )
  ipc.register('term.input', ({ id, data }) => termInput(id, data))
  ipc.register('term.resize', ({ id, cols, rows }) => termResize(id, cols, rows))
  ipc.register('term.kill', ({ id }) => termKill(id))
  // ACP agent panels (acp blueprint): adapter processes are core-owned OS
  // resources; everything streams as acp.* CoreEvents. NEVER log adapter
  // stdout/stderr or chat content. No withWriteLock (agents write via their
  // own tools, not the engine), no identity.
  ipc.register('acp.start', ({ agent, cwd, conversationId }) => {
    // B0: the core host is the sole SQLite opener, so it hands acp the
    // transcript backend (db + vault_id). No db/vault yet (picker pending) →
    // null: the session runs, persistence is a clean no-op.
    const db = getAppDb()
    const vid = currentVaultId()
    const vaultPath = engine.getConfig().vaultPath
    const resolvedCwd = cwd ?? vaultPath
    return acpStart((e) => ipc.emit(e), {
      agent,
      cwd: resolvedCwd,
      conversationId,
      persist: db && vid ? { db, vaultId: vid } : null,
      // WP-A: a `projects/<client>/…` cwd scopes the session to that client
      // (◈ chip); a vault-root or research cwd derives null.
      clientSlug: deriveClientSlug(resolvedCwd, vaultPath),
    })
  })
  // B0 transcript reads (vault-scoped, sole-opener). load scope-checks the
  // conversation's vault_id at the seam — a cross-vault / unknown id is
  // ACP_CONV_UNKNOWN, never another vault's thread.
  ipc.register('agent.conv.list', ({ limit }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    return db && vid ? listConversations(db, vid, limit) : []
  })
  // History dropdown row actions — both vault-scoped at the seam (a cross-vault
  // id is a no-op, never touches another vault's thread).
  ipc.register('agent.conv.rename', ({ conversationId, title }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (db && vid) renameConversation(db, vid, conversationId, title)
  })
  ipc.register('agent.conv.delete', ({ conversationId }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (db && vid) deleteConversation(db, vid, conversationId)
  })
  ipc.register('agent.conv.load', ({ conversationId }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (!db || !vid) throw ipcError('ACP_CONV_UNKNOWN', 'no conversation store')
    const loaded = loadConversation(db, conversationId)
    if (!loaded || loaded.vaultId !== vid) {
      throw ipcError('ACP_CONV_UNKNOWN', 'unknown conversation')
    }
    const { vaultId: _v, ...out } = loaded
    return out
  })
  // B2 cross-provider continuation: a new session on `provider` bound to the
  // same conversation, seeded (or natively resumed) from its transcript. Needs
  // the transcript store — acpContinue scope-checks the conversation's vault_id.
  // cwd is the vault root (the only cwd the panel starts sessions with, B0/B1).
  ipc.register('agent.continue', ({ conversationId, provider, atVaultRoot }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (!db || !vid) throw ipcError('ACP_CONV_UNKNOWN', 'no conversation store')
    const { sessionId } = acpContinue((e) => ipc.emit(e), {
      conversationId,
      targetProvider: provider,
      // BL-5: the vault path is only the FALLBACK — acpContinue prefers the
      // thread's own recorded cwd so its .mcp.json servers load again.
      cwd: engine.getConfig().vaultPath,
      ...(atVaultRoot ? { atVaultRoot: true } : {}),
      persist: { db, vaultId: vid },
    })
    return { sessionId }
  })
  ipc.register('acp.prompt', ({ sessionId, text, attachments }) =>
    acpPrompt(sessionId, text, attachments),
  )
  ipc.register('acp.cancel', ({ sessionId }) => acpCancel(sessionId))
  ipc.register('acp.permission', ({ sessionId, requestId, optionId }) =>
    acpPermission(sessionId, requestId, optionId),
  )
  ipc.register('acp.stop', ({ sessionId }) => acpStop(sessionId))
  ipc.register('agent.setMode', ({ sessionId, modeId }) => acpSetMode(sessionId, modeId))
  // B1 per-provider API-key auth (Settings › AI providers). Keychain-backed
  // (agent-keys); the key never enters process.env / vault / a log — status
  // reports presence only. Terminal-login providers reuse the CLI subscription.
  ipc.register('agent.auth.status', () => agentKeyStatus())
  ipc.register('agent.auth.setKey', ({ agent, key }) => storeAgentKey(agent, key))
  ipc.register('agent.auth.clearKey', ({ agent }) => clearAgentKey(agent))
  // WP-B: always-allow permission rules (per-vault app.db; no vault/db → []/no-op).
  ipc.register('agent.permissions.list', () => {
    const db = getAppDb()
    const vid = currentVaultId()
    return db && vid ? loadPermissionRules(db, vid) : []
  })
  ipc.register('agent.permissions.set', ({ client, toolKind, decision }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (db && vid) setPermissionRule(db, vid, client, toolKind, decision)
  })
  ipc.register('agent.permissions.remove', ({ client, toolKind }) => {
    const db = getAppDb()
    const vid = currentVaultId()
    if (db && vid) removePermissionRule(db, vid, client, toolKind)
  })
  ipc.register('home.brief', () => engine.homeBrief())
  ipc.register('settings.identity.get', () => {
    // no vault yet (first run, story 13.2) → no ambient default, NOT an error:
    // the wizard's identity step must work before any config exists
    let ambient: Identity | null = null
    try {
      ambient = engine.ambientIdentity()
    } catch {
      ambient = null
    }
    return { profile: loadIdentityProfile(), ambient }
  })
  ipc.register('settings.identity.set', (identity) => {
    if (!isValidIdentity(identity)) {
      throw ipcError('INTERNAL', 'identity needs a name and a valid email')
    }
    saveIdentityProfile(identity)
  })
  // Activity feed (story 6.2): git log through the lib's activity grammar.
  // Recomputed on every call — git IS the cache (state-placement rule).
  ipc.register('activity.feed', ({ since, limit }) => engine.activityFeed({ since, limit }))
  // Sync health (story 5.2). sync.status is read-only (lib syncStatus — never
  // fetches); its warnings render in the panel grid. sync.run is a lib write
  // op: write lock + per-command identity; every warning it produces is ALSO
  // emitted as git.warning (F8: nothing git says goes unseen).
  ipc.register('sync.status', () => engine.syncHealth())
  ipc.register('sync.handshake', () => {
    const status = engine.schemaStatus()
    if (!status.ok) {
      ipc.emit({
        kind: 'git.warning',
        text: `vault notes declare loredex schema ${status.declared} but this app supports ${status.supported} — a newer CLI/agent wrote here; update Loredex Desktop before writing (split-brain risk)`,
      })
    }
    return {
      engineVersion: engine.engineVersion(),
      schemaSupported: status.supported,
      schemaDeclared: status.declared,
      ok: status.ok,
    }
  })
  ipc.register('sync.run', () =>
    withWriteLock((): SyncReport => {
      const before = engine.syncHealth()
      const profile = loadIdentityProfile()
      const result = profile
        ? withGitIdentity(profile, () => engine.pullPush())
        : engine.pullPush()
      const after = engine.syncHealth()
      const report: SyncReport = {
        pulled: result.pulled ? before.behind : 0,
        pushed: result.pushed,
        warnings: after.warnings,
      }
      for (const text of report.warnings) ipc.emit({ kind: 'git.warning', text })
      ipc.emit({ kind: 'sync.changed', health: after })
      if (report.pulled > 0) ipc.emit({ kind: 'vault.changed', paths: [] }) // integrated notes → refetch
      hooks.onSyncRun?.() // story 9.1: "Sync now" resets the poll clock
      return report
    }),
  )
  // MCP host state + port override (story 1.6). The override applies on the
  // next core-host start — no live rebind, the discovery file must stay true.
  ipc.register('mcp.status', () => getMcpStatus())
  // slice C: MCP server switches + connect snippet
  ipc.register('mcp.settings.get', () => ({
    autostart: loadMcpAutostart(),
    writeTools: loadMcpWriteTools(),
  }))
  ipc.register('mcp.settings.set', ({ autostart, writeTools }) => {
    if (autostart !== undefined) saveMcpAutostart(autostart)
    if (writeTools !== undefined) saveMcpWriteTools(writeTools)
  })
  ipc.register('mcp.connectSnippet', () => {
    const st = getMcpStatus()
    const port = st.port ?? st.preferredPort
    const token = loadOrCreateMcpToken()
    return {
      snippet: JSON.stringify(
        {
          mcpServers: {
            loredex: {
              type: 'http',
              url: `http://127.0.0.1:${port}/`,
              headers: { Authorization: `Bearer ${token}` },
            },
          },
        },
        null,
        2,
      ),
    }
  })
  // v3 §6.5 (story 26.5): read-only session telemetry for the Agents view
  ipc.register('agents.sessions', () => ({ log: mcpRequestLog(), mcp: getMcpStatus() }))
  // story 26.9: per-agent MCP tokens — mint shows the token once, list = names
  ipc.register('agents.tokens.list', () => Object.keys(loadAgentTokens()).sort())
  ipc.register('agents.tokens.mint', ({ name }) => {
    const clean = name.trim()
    if (!clean) throw { code: 'AGENT_NAME_REQUIRED', message: 'Give the agent a name first.' }
    return { token: mintAgentToken(clean) }
  })
  ipc.register('agents.tokens.revoke', ({ name }) => revokeAgentToken(name))
  // v3 §9 GitHub auth (story 26.7) — token stays core-side, status is masked.
  // The askpass cache (story 26.9) carries the STORED token only: an explicit
  // in-app sign-in overrides the machine's git helpers; a mere gh session is
  // already the user's own setup and is left alone.
  void storedToken().then((t) => setGitCredentialToken(t))
  ipc.register('auth.status', async () => {
    const status = await authStatus()
    setGitCredentialToken(await storedToken())
    return status
  })
  ipc.register('auth.loginWithToken', async ({ token }) => {
    const user = await validateToken(token)
    if (!user) throw { code: 'AUTH_INVALID_TOKEN', message: 'GitHub rejected that token — nothing was stored.' }
    const stored = await storeToken(token)
    if (!stored)
      throw {
        code: 'AUTH_STORE_UNAVAILABLE',
        message: 'No secure token store on this OS — use `gh auth login` instead.',
      }
    setGitCredentialToken(token)
    return authStatus()
  })
  ipc.register('auth.logout', async () => {
    await deleteToken()
    setGitCredentialToken(null) // back to the user's own git setup
    return authStatus()
  })
  ipc.register('auth.deviceStart', () => deviceFlowStart())
  ipc.register('auth.devicePoll', async ({ deviceCode }) => {
    const r = await deviceFlowPoll(deviceCode)
    if (r.state === 'authorized') {
      await storeToken(r.token)
      setGitCredentialToken(r.token)
      return { state: 'authorized' as const }
    }
    return { state: r.state }
  })
  ipc.register('dex.registry', () => listDexRepos())
  // v3 Plan/Today (slices D/E): work items over the seam
  ipc.register('work.list', () => engine.workItems(new Date().toISOString().slice(0, 10)))
  ipc.register('work.update', ({ id, patch, identity }) =>
    withWriteLock(() => engine.workUpdate(id, patch, identity)),
  )
  ipc.register('dex.createRepo', ({ name, isPrivate }) => createDexRepo(name, isPrivate))
  // Theme preference (story 14.1): per-user app state, applied renderer-side.
  ipc.register('settings.theme.get', () => loadThemeSetting())
  ipc.register('settings.theme.set', ({ theme }) => {
    if (!isThemeSetting(theme)) {
      throw ipcError('INTERNAL', 'theme must be one of system, light, dark')
    }
    saveThemeSetting(theme)
  })
  // Font preferences: per-user app state, applied renderer-side (like theme).
  ipc.register('settings.fonts.get', () => loadFontSettings())
  ipc.register('settings.fonts.set', ({ fonts }) => {
    if (!isFontSettings(fonts)) throw ipcError('INTERNAL', 'invalid font settings')
    saveFontSettings(fonts)
  })
  // Collapsible rails (story 16.2, Addendum D1): per-vault UI pref, app.db
  // only (state-placement rule). No vault/db open yet → expanded defaults.
  ipc.register('settings.rails.get', () => {
    const db = getAppDb()
    const vid = currentVaultId()
    return db && vid ? loadRailsCollapsed(db, vid) : { sidebar: false, list: false }
  })
  ipc.register('settings.rails.set', (rails) => {
    const { db, vid } = requireDb()
    saveRailsCollapsed(db, vid, { sidebar: rails.sidebar === true, list: rails.list === true })
  })
  // Vault tree sections (story 16.3, Addendum D1): per-vault collapsed set,
  // app.db only — same placement rules as settings.rails.
  ipc.register('settings.treeSections.get', () => {
    const db = getAppDb()
    const vid = currentVaultId()
    return db && vid ? loadTreeSectionsCollapsed(db, vid) : { collapsed: [] }
  })
  ipc.register('settings.treeSections.set', (state) => {
    const { db, vid } = requireDb()
    saveTreeSectionsCollapsed(db, vid, state)
  })
  // List-pane width (story epic17.4, D1 amendment 3): per-vault UI pref, app.db
  // only — same placement rules as settings.rails. No vault/db → 300px default.
  ipc.register('settings.listWidth.get', () => {
    const db = getAppDb()
    const vid = currentVaultId()
    return db && vid ? { width: loadListPaneWidth(db, vid) } : { width: 300 }
  })
  ipc.register('settings.listWidth.set', ({ width }) => {
    const { db, vid } = requireDb()
    saveListPaneWidth(db, vid, width)
  })
  // Terminal drawer prefs (terminal-splits blueprint): per-vault UI pref,
  // app.db only — same placement rules as settings.rails. No vault/db →
  // closed at the 280px default.
  ipc.register('settings.terminal.get', () => {
    const db = getAppDb()
    const vid = currentVaultId()
    return db && vid
      ? loadTerminalPrefs(db, vid)
      : { open: false, height: 280, dock: 'bottom' as const, width: 380 }
  })
  ipc.register('settings.terminal.set', (prefs) => {
    const { db, vid } = requireDb()
    saveTerminalPrefs(db, vid, prefs)
  })
  // Agent panel prefs (acp blueprint): per-vault UI pref, app.db only — same
  // placement rules as settings.terminal. No vault/db → closed at 340px.
  ipc.register('settings.agentPanel.get', () => {
    const db = getAppDb()
    const vid = currentVaultId()
    return db && vid ? loadAgentPanelPrefs(db, vid) : { open: false, width: 340 }
  })
  ipc.register('settings.agentPanel.set', (prefs) => {
    const { db, vid } = requireDb()
    saveAgentPanelPrefs(db, vid, prefs)
  })
  // Atlas legend seen (story epic17.2, D1 amendment 3): app-global meta flag —
  // no vault/db needed to READ (defaults to unseen so the popover shows once);
  // the set persists only when a db is open (first run before a vault is fine).
  ipc.register('settings.atlasLegendSeen.get', () => ({ seen: loadAtlasLegendSeen() }))
  ipc.register('settings.atlasLegendSeen.set', () => {
    saveAtlasLegendSeen()
  })
  ipc.register('settings.mcpPort.set', ({ port }) => {
    if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      throw ipcError('INTERNAL', 'MCP port must be an integer between 1024 and 65535')
    }
    saveMcpPortOverride(port)
  })
  // Apply & retry: persist the port, then rebind the in-app MCP host now —
  // clears a stale port-conflict or moves to a new port without a relaunch.
  ipc.register('mcp.restart', async ({ port }) => {
    if (port !== undefined) {
      if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
        throw ipcError('INTERNAL', 'MCP port must be an integer between 1024 and 65535')
      }
      saveMcpPortOverride(port)
    }
    const portOverride = loadMcpPortOverride()
    return restartMcpServer({
      port: portOverride ?? PREFERRED_MCP_PORT,
      portOverride,
      token: loadOrCreateMcpToken(),
      agentTokens: () => loadAgentTokens(),
      writeTools: () => loadMcpWriteTools(),
      onWarning: (text) => ipc.emit({ kind: 'git.warning', text }),
    })
  })

  // M2 wizards (stories 13.1/13.2, m2 §7): core-host step sequences. They run
  // against an EXPLICIT path (no config may exist yet — first run); all git is
  // non-interactive (auth failures fail fast with git's own words, no OAuth);
  // mutations hold the write lock; the cursor seed prevents the join storm.
  const wizardDeps: WizardDeps = {
    emit: (event) => ipc.emit(event),
    git: (cwd, args) => gitAsync(cwd, args, { env: { ...NON_INTERACTIVE_GIT_ENV, ...gitCredentialEnv() } }),
    clone: gitCloneStreaming,
    identity: () => loadIdentityProfile(),
    scaffold: (path, dexType) => engine.scaffoldNewVault(path, dexType),
    readConfig: () => engine.readConfigFile(),
    writeConfig: (config) => engine.writeConfigFile(config),
    ensureMergeDriver: (path) => engine.ensureMergeDriverAt(path),
    syncHealth: (path) => engine.syncHealthAt(path),
    schemaStatus: (path) => engine.schemaStatusAt(path),
    seedCursor: (vaultPath, remoteUrl, cursor) => {
      const db = getAppDb()
      if (!db) return // bare test host — the poller needs the db anyway
      setPollCursor(db, vaultId(vaultPath, remoteUrl), {
        branch: cursor.branch,
        lastSeenSha: cursor.sha,
        lastFetchAt: new Date().toISOString(),
      })
    },
    lock: withWriteLock,
  }
  ipc.register('wizard.validateRemote', ({ url }) => validateRemote(wizardDeps, url))
  ipc.register('wizard.createVault', ({ dir, remoteUrl, dexType }) =>
    createVault(wizardDeps, {
      dir,
      ...(remoteUrl ? { remoteUrl } : {}),
      ...(dexType ? { dexType } : {}),
    }),
  )
  ipc.register('wizard.joinVault', ({ url, dest, branch }) =>
    joinVault(wizardDeps, { url, dest, ...(branch ? { branch } : {}) }),
  )

  return notifier
}
