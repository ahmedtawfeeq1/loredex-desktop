/**
 * Vault watcher (story 9.3 / epic2.story3): @parcel/watcher (FSEvents) is the
 * decided watcher; this module is the ONLY place its API is used. Bursts are
 * debounced into one batch; a batch past the storm threshold is not trusted
 * per-file (F4 rule) — the sink reconciles from filesystem truth instead.
 */
import { realpathSync } from 'node:fs'
import { relative } from 'node:path'
import { subscribe } from '@parcel/watcher'

export const DEBOUNCE_MS = 250
/** more touched notes than this in one batch = a pull storm → full reconcile */
export const STORM_THRESHOLD = 25

export interface BatchSink {
  /** deduped vault-relative markdown paths, one call per debounced burst */
  onBatch(paths: string[]): void
  /** storm: per-file events are not trusted — reconcile from disk (F4) */
  onStorm(): void
}

export interface EventBatcher {
  /** feed raw absolute paths from watcher events */
  push(absPaths: string[]): void
  /** fire the pending batch now (tests; stop()) */
  flush(): void
}

/**
 * Debounce + dedupe + scope: markdown files inside the vault, never `.git/**`
 * (defense in depth — the subscription also ignores it). Trailing debounce:
 * 10 rapid writes are ONE batch, hence one reconcile downstream.
 */
export function createEventBatcher(
  vaultPath: string,
  sink: BatchSink,
  opts: { debounceMs?: number; stormThreshold?: number } = {},
): EventBatcher {
  const debounceMs = opts.debounceMs ?? DEBOUNCE_MS
  const stormThreshold = opts.stormThreshold ?? STORM_THRESHOLD
  const pending = new Set<string>()
  let timer: ReturnType<typeof setTimeout> | null = null

  function fire(): void {
    timer = null
    if (pending.size === 0) return
    const paths = [...pending]
    pending.clear()
    if (paths.length > stormThreshold) sink.onStorm()
    else sink.onBatch(paths)
  }

  return {
    push(absPaths) {
      for (const abs of absPaths) {
        const rel = relative(vaultPath, abs).split('\\').join('/')
        if (!rel || rel.startsWith('..')) continue // outside the vault
        if (rel === '.git' || rel.startsWith('.git/')) continue
        if (!rel.endsWith('.md')) continue
        pending.add(rel)
      }
      if (pending.size === 0) return
      if (timer) clearTimeout(timer)
      timer = setTimeout(fire, debounceMs)
      timer.unref?.()
    },
    flush() {
      if (timer) clearTimeout(timer)
      fire()
    },
  }
}

export interface VaultWatcher {
  stop(): Promise<void>
}

/** Subscribe the vault (ignoring `.git`) and pump events through a batcher. */
export async function startVaultWatcher(opts: {
  vaultPath: string
  sink: BatchSink
  onError(text: string): void
  debounceMs?: number
}): Promise<VaultWatcher> {
  // FSEvents reports realpaths (/var → /private/var on macOS); resolve the
  // root the same way or every event looks "outside the vault"
  const root = realpathSync(opts.vaultPath)
  const batcher = createEventBatcher(root, opts.sink, {
    ...(opts.debounceMs !== undefined ? { debounceMs: opts.debounceMs } : {}),
  })
  const subscription = await subscribe(
    root,
    (err, events) => {
      if (err) {
        opts.onError(`vault watcher error: ${err.message}`)
        return
      }
      batcher.push(events.map((event) => event.path))
    },
    { ignore: ['.git'] },
  )
  return {
    async stop() {
      batcher.flush()
      await subscription.unsubscribe()
    },
  }
}
