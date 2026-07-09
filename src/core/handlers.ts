/**
 * Registers the CoreApi handlers implemented so far onto the dispatcher.
 * Unregistered channels answer NOT_IMPLEMENTED from the dispatcher itself.
 */
import { toVaultRelative } from '../shared/handoff-lanes'
import { isValidIdentity } from '../shared/identity'
import { ipcError, type MainControlMessage } from '../shared/ipc-contract'
import * as engine from './engine'
import { aggregateFacetValues, clearFacetCache, filterHits } from './facets'
import type { CoreIpc } from './ipc'
import { invalidateLinkIndex, resolveLink } from './links'
import { getMcpStatus } from './mcp-server'
import { createHandoffNotifier, type HandoffNotifier } from './notify'
import { loadIdentityProfile, saveIdentityProfile, saveMcpPortOverride } from './settings'
import { listMarkdownFiles, walkVault } from './tree'
import { withWriteLock } from './write-lock'

export function registerCoreHandlers(
  ipc: CoreIpc,
  // story 3.7: display requests travel core → main; tests default to a no-op
  postToMain: (msg: MainControlMessage) => void = () => {},
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
    // the manual refresh re-walks the tree — rebuild the link index and the
    // facet cache with it, and run the new-handoff check (story 3.7 trigger)
    invalidateLinkIndex()
    clearFacetCache()
    notifier.refresh()
    return walkVault(engine.getConfig().vaultPath)
  })
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
  ipc.register('handoffs.list', ({ scope, project }) => {
    // every board fetch doubles as the new-handoff check (story 3.7)
    const all = notifier.refresh()
    if (!project) return all // company-wide: direction is ignored without a project
    return engine.handoffs({ direction: scope, project })
  })
  // Consume is a lib write op: write lock (3.5 shim) + per-command git identity.
  ipc.register('handoffs.consume', ({ id, identity }) =>
    withWriteLock(() => {
      if (!isValidIdentity(identity)) {
        throw ipcError('INTERNAL', 'consume needs an identity — set name and email in Settings')
      }
      const receipt = engine.consume(id, identity)
      const rel = toVaultRelative(receipt.path, engine.getConfig().vaultPath)
      ipc.emit({ kind: 'handoff.stateChanged', id, from: 'open', to: 'consumed', by: identity })
      ipc.emit({ kind: 'vault.changed', paths: [rel] })
      notifier.refresh() // badge drops immediately (story 3.7 AC3)
      return receipt
    }),
  )
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
  // MCP host state + port override (story 1.6). The override applies on the
  // next core-host start — no live rebind, the discovery file must stay true.
  ipc.register('mcp.status', () => getMcpStatus())
  ipc.register('settings.mcpPort.set', ({ port }) => {
    if (port !== null && (!Number.isInteger(port) || port < 1024 || port > 65535)) {
      throw ipcError('INTERNAL', 'MCP port must be an integer between 1024 and 65535')
    }
    saveMcpPortOverride(port)
  })

  return notifier
}
