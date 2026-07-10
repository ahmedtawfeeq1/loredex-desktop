/** Story 9.1: single-flight write lock — mutual exclusion, FIFO, tryAcquire. */
import { describe, expect, it } from 'vitest'
import { createWriteLock, withWriteLock } from './write-lock'

const flush = (): Promise<void> => new Promise((resolve) => setImmediate(resolve))

describe('createWriteLock', () => {
  it('is mutually exclusive — the second acquire waits for release', async () => {
    const lock = createWriteLock()
    const release1 = await lock.acquire()
    let second = false
    const pending = lock.acquire().then((release) => {
      second = true
      return release
    })
    await flush()
    expect(second).toBe(false)
    expect(lock.isLocked()).toBe(true)
    release1()
    const release2 = await pending
    expect(second).toBe(true)
    expect(lock.isLocked()).toBe(true) // handed over, not freed
    release2()
    expect(lock.isLocked()).toBe(false)
  })

  it('wakes waiters in FIFO order (queue fairness)', async () => {
    const lock = createWriteLock()
    const order: number[] = []
    const first = await lock.acquire()
    const waiters = [1, 2, 3].map((n) =>
      lock.acquire().then((release) => {
        order.push(n)
        release()
      }),
    )
    first()
    await Promise.all(waiters)
    expect(order).toEqual([1, 2, 3])
  })

  it('tryAcquire skips when busy and takes when free (poller discipline)', async () => {
    const lock = createWriteLock()
    const release = await lock.acquire()
    expect(lock.tryAcquire()).toBeNull() // busy: poller skips its tick
    release()
    const got = lock.tryAcquire()
    expect(got).not.toBeNull()
    expect(lock.isLocked()).toBe(true)
    got?.()
    expect(lock.isLocked()).toBe(false)
  })

  it('double-release is a no-op — cannot free someone else’s turn', async () => {
    const lock = createWriteLock()
    const release1 = await lock.acquire()
    release1()
    const release2 = lock.tryAcquire()
    expect(release2).not.toBeNull()
    release1() // stale double release
    expect(lock.isLocked()).toBe(true) // holder 2 still owns it
    release2?.()
    expect(lock.isLocked()).toBe(false)
  })
})

describe('withWriteLock (story 3.4-compatible wrapper on THE instance)', () => {
  it('serializes and never wedges on a failed write', async () => {
    const order: string[] = []
    const failing = withWriteLock(async () => {
      order.push('first')
      throw new Error('boom')
    }).catch(() => order.push('first-failed'))
    const next = withWriteLock(() => order.push('second'))
    await Promise.all([failing, next])
    expect(order[0]).toBe('first')
    expect(order).toContain('first-failed') // rejection propagated
    expect(order).toContain('second') // and the lock was not wedged
  })
})
