/**
 * Registers the CoreApi handlers implemented so far onto the dispatcher.
 * Unregistered channels answer NOT_IMPLEMENTED from the dispatcher itself.
 */
import { toVaultRelative } from '../shared/handoff-lanes'
import { isValidIdentity } from '../shared/identity'
import { isThemeSetting } from '../shared/theme'
import { ipcError, type MainControlMessage } from '../shared/ipc-contract'
import type { Identity, SyncReport } from '../shared/types'
import * as engine from './engine'
import { atlasGraph, atlasTours, invalidateAtlas } from './atlas'
import { getAppDb, vaultId } from './db/index'
import { getReadState, markRead } from './db/read-state'
import { reconcileSnoozeTimers } from './db/snooze'
import { aggregateFacetValues, clearFacetCache, filterHits } from './facets'
import { withGitIdentity } from './git'
import type { CoreIpc } from './ipc'
import { invalidateLinkIndex, resolveLink } from './links'
import { getMcpStatus } from './mcp-server'
import { createHandoffNotifier, type HandoffNotifier } from './notify'
import {
  loadIdentityProfile,
  loadThemeSetting,
  saveIdentityProfile,
  saveMcpPortOverride,
  saveThemeSetting,
} from './settings'
import { buildThread, collectComments } from './threads'
import { listMarkdownFiles, walkVault } from './tree'
import { withWriteLock } from './write-lock'

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
    return walkVault(engine.getConfig().vaultPath)
  })
  // Vault Atlas (story 10.1): the whole derived graph, memoized core-side —
  // same recomputed-cache tier as the link index (never authoritative).
  ipc.register('atlas.graph', ({ level, scope }) => atlasGraph(level, scope ?? {}))
  // Tours (story 10.5): extracted from reading orders/threads/topics — same
  // recomputed-cache tier and invalidation as the graph itself.
  ipc.register('atlas.tours', ({ scope }) => atlasTours(scope ?? {}))
  ipc.register('vault.resolveLink', ({ link, from }) =>
    resolveLink(engine.getConfig().vaultPath, link, from),
  )
  // full-text ranking is the lib's searchVault; facets narrow by frontmatter
  // app-side (story 2.4). Wider limit so narrowing has material to work on.
  ipc.register('vault.search', ({ q, facets }) =>
    filterHits(engine.search(q, 50), facets, engine.noteMeta),
  )
  ipc.register('vault.facets', () => {
    const vaultPath = engine.getConfig().vaultPath
    return aggregateFacetValues(vaultPath, listMarkdownFiles(vaultPath), engine.noteMeta)
  })
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
        })
      }
      ipc.emit({
        kind: 'vault.changed',
        paths: result.written.map((w) => toVaultRelative(w, vaultPath)),
      })
      return result
    }),
  )
  // Product home (story 2.5). dashboard.build is the re-curate seam — it runs
  // in the core host so a long build never blocks a window; story 2.6 hooks
  // its post-build snapshot here (callback point, not implemented in v0.1).
  ipc.register('dashboard.build', () => engine.dashboard(new Date().toISOString().slice(0, 10)))
  ipc.register('home.brief', () => engine.homeBrief())
  ipc.register('settings.identity.get', () => ({
    profile: loadIdentityProfile(),
    ambient: engine.ambientIdentity(),
  }))
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
  // Theme preference (story 14.1): per-user app state, applied renderer-side.
  ipc.register('settings.theme.get', () => loadThemeSetting())
  ipc.register('settings.theme.set', ({ theme }) => {
    if (!isThemeSetting(theme)) {
      throw ipcError('INTERNAL', 'theme must be one of system, light, dark')
    }
    saveThemeSetting(theme)
  })
  ipc.register('settings.mcpPort.set', ({ port }) => {
    if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      throw ipcError('INTERNAL', 'MCP port must be an integer between 1024 and 65535')
    }
    saveMcpPortOverride(port)
  })

  return notifier
}
