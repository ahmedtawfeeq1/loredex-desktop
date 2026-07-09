/**
 * Registers the CoreApi handlers implemented so far onto the dispatcher.
 * Unregistered channels answer NOT_IMPLEMENTED from the dispatcher itself.
 */
import * as engine from './engine'
import type { CoreIpc } from './ipc'
import { invalidateLinkIndex, resolveLink } from './links'
import { walkVault } from './tree'

export function registerCoreHandlers(ipc: CoreIpc): void {
  ipc.register('config.get', () => engine.getConfig())
  ipc.register('app.identity', () => engine.identity())
  ipc.register('vault.readNote', ({ path }) => engine.readNote(path))
  ipc.register('vault.tree', () => {
    // the manual refresh re-walks the tree — rebuild the link index with it
    invalidateLinkIndex()
    return walkVault(engine.getConfig().vaultPath)
  })
  ipc.register('vault.resolveLink', ({ link, from }) =>
    resolveLink(engine.getConfig().vaultPath, link, from),
  )
  // `facets` is accepted by the contract but ignored until story 2.4
  ipc.register('vault.search', ({ q }) => engine.search(q))
  ipc.register('handoffs.list', ({ scope, project }) =>
    engine.handoffs(project ? { direction: scope, project } : { direction: scope }),
  )
}
