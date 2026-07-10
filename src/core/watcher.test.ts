/**
 * Story 9.3: watcher batching — debounce (10 rapid writes → ONE reconcile),
 * storm threshold → full reconcile, scope rules (.git ignored, md only).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createEventBatcher, DEBOUNCE_MS, STORM_THRESHOLD } from './watcher'

function harness(opts: { debounceMs?: number; stormThreshold?: number } = {}) {
  const batches: string[][] = []
  let storms = 0
  const batcher = createEventBatcher(
    '/vault',
    {
      onBatch: (paths) => batches.push(paths),
      onStorm: () => {
        storms += 1
      },
    },
    opts,
  )
  return { batcher, batches, storms: () => storms }
}

describe('createEventBatcher', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('debounces 10 rapid writes into ONE batch (one reconcile downstream)', () => {
    const { batcher, batches } = harness()
    for (let i = 0; i < 10; i += 1) {
      batcher.push([`/vault/projects/alpha/notes/note-${i}.md`])
      vi.advanceTimersByTime(50) // rapid: each write inside the debounce window
    }
    expect(batches).toHaveLength(0) // still settling
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(10)
  })

  it('dedupes repeated events for the same file', () => {
    const { batcher, batches } = harness()
    batcher.push(['/vault/a.md', '/vault/a.md'])
    batcher.push(['/vault/a.md'])
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(batches).toEqual([['a.md']])
  })

  it('a batch past the storm threshold reconciles instead (F4 — never trust per-file)', () => {
    const { batcher, batches, storms } = harness()
    const paths = Array.from(
      { length: STORM_THRESHOLD + 1 },
      (_, i) => `/vault/projects/a/notes/n${i}.md`,
    )
    batcher.push(paths)
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(storms()).toBe(1)
    expect(batches).toHaveLength(0)
  })

  it('ignores .git/**, non-markdown and outside-vault paths entirely', () => {
    const { batcher, batches, storms } = harness()
    batcher.push([
      '/vault/.git/objects/ab/cdef',
      '/vault/.git/index.md', // even md under .git stays out
      '/vault/assets/logo.png',
      '/elsewhere/other.md',
      '/vault/projects/alpha/notes/real.md',
    ])
    vi.advanceTimersByTime(DEBOUNCE_MS)
    expect(batches).toEqual([['projects/alpha/notes/real.md']])
    expect(storms()).toBe(0)
    // a burst of ONLY ignorable events schedules nothing at all
    batcher.push(['/vault/.git/HEAD'])
    vi.advanceTimersByTime(DEBOUNCE_MS * 4)
    expect(batches).toHaveLength(1)
  })

  it('flush fires the pending batch immediately (stop path)', () => {
    const { batcher, batches } = harness()
    batcher.push(['/vault/a.md'])
    batcher.flush()
    expect(batches).toEqual([['a.md']])
  })
})
