/**
 * Core-host side of the seam: MessagePort server — CoreApi dispatch + event
 * fan-out. Unknown channels and handler throws become typed envelopes; nothing
 * here may crash the host (architecture.md#ipc-contract).
 */
import {
  type CoreApi,
  type CoreEvent,
  type ErrEnvelope,
  ipcError,
  isErrEnvelope,
  isWireMessage,
  type PortLike,
} from '../shared/ipc-contract'

type Handler<K extends keyof CoreApi> = (
  arg: CoreApi[K]['in'],
) => CoreApi[K]['out'] | Promise<CoreApi[K]['out']>

export interface CoreIpc {
  register<K extends keyof CoreApi>(ch: K, handler: Handler<K>): void
  emit(event: CoreEvent): void
  attach(port: PortLike): void
}

export function createCoreIpc(): CoreIpc {
  const handlers = new Map<string, (arg: unknown) => unknown>()
  const ports: PortLike[] = []

  async function dispatch(
    ch: string,
    arg: unknown,
  ): Promise<{ ok: true; out: unknown } | { ok: false; err: ErrEnvelope }> {
    const handler = handlers.get(ch)
    if (!handler) {
      return { ok: false, err: ipcError('NOT_IMPLEMENTED', `unknown channel: ${ch}`) }
    }
    try {
      return { ok: true, out: await handler(arg) }
    } catch (e) {
      if (isErrEnvelope(e)) return { ok: false, err: e }
      return {
        ok: false,
        err: ipcError('INTERNAL', e instanceof Error ? e.message : String(e)),
      }
    }
  }

  return {
    register(ch, handler) {
      handlers.set(ch, handler as (arg: unknown) => unknown)
    },
    emit(event) {
      for (const port of ports) port.postMessage({ t: 'evt', event })
    },
    attach(port) {
      ports.push(port)
      port.onMessage((data) => {
        if (!isWireMessage(data)) return // malformed → ignore, never crash
        if (data.t === 'ping') {
          port.postMessage({ t: 'pong' })
          return
        }
        if (data.t !== 'req') return
        void dispatch(data.ch, data.arg).then((r) =>
          port.postMessage({ t: 'res', id: data.id, ...r }),
        )
      })
      port.start?.()
    },
  }
}
