/**
 * Registers the CoreApi handlers implemented so far onto the dispatcher.
 * Unregistered channels answer NOT_IMPLEMENTED from the dispatcher itself.
 */
import * as engine from './engine'
import type { CoreIpc } from './ipc'

export function registerCoreHandlers(ipc: CoreIpc): void {
  ipc.register('config.get', () => engine.getConfig())
  ipc.register('vault.readNote', ({ path }) => engine.readNote(path))
  // `facets` is accepted by the contract but ignored until story 2.4
  ipc.register('vault.search', ({ q }) => engine.search(q))
}
