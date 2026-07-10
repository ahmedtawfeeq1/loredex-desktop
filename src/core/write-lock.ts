/**
 * Single-flight write lock (story 9.1 / epic3.story5 — replaces the story-3.4
 * promise-chain shim; call sites kept `withWriteLock`). ONE mutex instance in
 * the core host is the ONLY gate: every lib write op AND the poller's pull go
 * through it — never two concurrent git mutations, by construction.
 *
 * Fairness: FIFO. `acquire()` (blocking) is for user work — writes and manual
 * sync; `tryAcquire()` is for the poller, which skips its tick when busy —
 * user work always wins (architecture-m2.md §4).
 */

export interface WriteLock {
  /** Wait for the lock; resolves with the release function. FIFO order. */
  acquire(): Promise<() => void>
  /** Take the lock only if free; null when busy (poller: skip the tick). */
  tryAcquire(): (() => void) | null
  isLocked(): boolean
}

export function createWriteLock(): WriteLock {
  let locked = false
  const queue: Array<(release: () => void) => void> = []

  function makeRelease(): () => void {
    let released = false
    return () => {
      if (released) return // double-release is a no-op, never a corruption
      released = true
      const next = queue.shift()
      if (next) next(makeRelease()) // hand over, stays locked
      else locked = false
    }
  }

  return {
    acquire() {
      if (!locked) {
        locked = true
        return Promise.resolve(makeRelease())
      }
      return new Promise((resolve) => queue.push(resolve))
    },
    tryAcquire() {
      if (locked) return null
      locked = true
      return makeRelease()
    },
    isLocked() {
      return locked
    },
  }
}

/** THE core-host instance (coding standard #7: all lib write ops acquire it). */
export const writeLock = createWriteLock()

/** Story 3.4-compatible wrapper — every existing write call site keeps this. */
export async function withWriteLock<T>(fn: () => T | Promise<T>): Promise<T> {
  const release = await writeLock.acquire()
  try {
    return await fn()
  } finally {
    release()
  }
}
