/**
 * Client side of the seam (lives in the preload, which owns the brokered
 * port). Correlation by id, per-invoke timeout, event fan-out, and port-swap
 * survival: pending invokes are rejected with a retryable PORT_SWAPPED
 * envelope and listeners keep working on the new port.
 */
import {
  type CoreApi,
  type CoreEvent,
  ipcError,
  isWireMessage,
  type PortLike,
  type Unsubscribe,
} from './ipc-contract'

export interface IpcClient {
  attach(port: PortLike): void
  invoke<K extends keyof CoreApi>(ch: K, arg: CoreApi[K]['in']): Promise<CoreApi[K]['out']>
  onEvent(cb: (e: CoreEvent) => void): Unsubscribe
}

interface Pending {
  resolve: (out: unknown) => void
  reject: (err: unknown) => void
  timer: ReturnType<typeof setTimeout>
}

export function createIpcClient(opts: { timeoutMs?: number } = {}): IpcClient {
  const timeoutMs = opts.timeoutMs ?? 10_000
  const pending = new Map<number, Pending>()
  const listeners = new Set<(e: CoreEvent) => void>()
  const preAttachBuffer: unknown[] = []
  let port: PortLike | null = null
  let nextId = 1

  function send(msg: unknown): void {
    if (port) port.postMessage(msg)
    else preAttachBuffer.push(msg)
  }

  function settle(id: number): Pending | undefined {
    const p = pending.get(id)
    if (p) {
      pending.delete(id)
      clearTimeout(p.timer)
    }
    return p
  }

  return {
    attach(newPort) {
      // Core-host respawn / re-broker: drop in-flight invokes with a retryable envelope.
      for (const [id, p] of [...pending]) {
        pending.delete(id)
        clearTimeout(p.timer)
        p.reject(ipcError('PORT_SWAPPED', 'core host port was re-brokered', { retryable: true }))
      }
      port = newPort
      newPort.onMessage((data) => {
        if (!isWireMessage(data)) return
        if (data.t === 'pong') {
          console.log('[loredex] pong received from core host — transport alive')
          return
        }
        if (data.t === 'res') {
          const p = settle(data.id)
          if (!p) return
          if (data.ok) p.resolve(data.out)
          else p.reject(data.err)
          return
        }
        if (data.t === 'evt') for (const cb of listeners) cb(data.event)
      })
      newPort.start?.()
      newPort.postMessage({ t: 'ping' }) // story-1.1 liveness smoke
      while (preAttachBuffer.length > 0) newPort.postMessage(preAttachBuffer.shift())
    },

    invoke(ch, arg) {
      const id = nextId++
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          if (settle(id)) reject(ipcError('TIMEOUT', `invoke ${ch} timed out after ${timeoutMs}ms`))
        }, timeoutMs)
        pending.set(id, { resolve: resolve as (out: unknown) => void, reject, timer })
        send({ t: 'req', id, ch, arg })
      })
    },

    onEvent(cb) {
      listeners.add(cb)
      return () => listeners.delete(cb)
    },
  }
}
