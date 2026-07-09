/**
 * Registers the CoreApi handlers implemented so far onto the dispatcher.
 * Unregistered channels answer NOT_IMPLEMENTED from the dispatcher itself.
 */
import { toVaultRelative } from '../shared/handoff-lanes'
import { isValidIdentity } from '../shared/identity'
import { ipcError } from '../shared/ipc-contract'
import * as engine from './engine'
import type { CoreIpc } from './ipc'
import { invalidateLinkIndex, resolveLink } from './links'
import { loadIdentityProfile, saveIdentityProfile } from './settings'
import { walkVault } from './tree'
import { withWriteLock } from './write-lock'

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
}
