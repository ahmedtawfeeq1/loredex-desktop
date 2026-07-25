/**
 * Per-channel invoke timeout. The blanket 10s cap reported a fleet `clients.pull`
 * (allowed ~120s) as "timed out after 10000ms" while it was still pulling — and
 * it often finished and wrote after the toast. Long channels get their own cap.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIpcClient } from './ipc-client'
import type { PortLike } from './ipc-contract'
import type { Identity } from './types'

/** A port that swallows everything and never replies, so only the timeout fires. */
const deadPort = (): PortLike => ({ postMessage: () => {}, onMessage: () => {} })

const IDENTITY: Identity = { name: 'x', email: 'x@example.com' } as Identity

describe('createIpcClient — per-channel timeout', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('rejects a default channel at 10s', async () => {
    const client = createIpcClient()
    client.attach(deadPort())
    const p = client.invoke('mcp.settings.get', undefined)
    const rejected = vi.fn()
    p.catch(rejected)

    await vi.advanceTimersByTimeAsync(9_999)
    expect(rejected).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2)
    expect(rejected).toHaveBeenCalledOnce()
    expect((rejected.mock.calls[0][0] as { code: string }).code).toBe('TIMEOUT')
  })

  it('gives clients.pull its own longer budget, not the 10s default', async () => {
    const client = createIpcClient()
    client.attach(deadPort())
    const p = client.invoke('clients.pull', { client: 'acme', identity: IDENTITY })
    const rejected = vi.fn()
    p.catch(rejected)

    // still pending well past the old 10s cap
    await vi.advanceTimersByTimeAsync(30_000)
    expect(rejected).not.toHaveBeenCalled()

    // fires at its own 125s budget
    await vi.advanceTimersByTimeAsync(95_001)
    expect(rejected).toHaveBeenCalledOnce()
    expect((rejected.mock.calls[0][0] as { message: string }).message).toContain('125000ms')
  })
})
