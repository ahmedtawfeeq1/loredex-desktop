/**
 * Write-lock shim (story 3.4): serializes lib write ops through one promise
 * chain. Story 3.5 (v0.1 scope cut: deferred) replaces this with the full
 * async mutex the poller integrates against — call sites keep this signature.
 */
let chain: Promise<unknown> = Promise.resolve()

export function withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const next = chain.then(fn)
  chain = next.catch(() => {}) // a failed write never wedges the lock
  return next
}
