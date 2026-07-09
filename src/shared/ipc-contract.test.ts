import { describe, expect, it } from 'vitest'
import { isWireMessage } from './ipc-contract'

describe('wire message codec', () => {
  it('accepts ping and pong', () => {
    expect(isWireMessage({ t: 'ping' })).toBe(true)
    expect(isWireMessage({ t: 'pong' })).toBe(true)
  })

  it('rejects malformed messages', () => {
    expect(isWireMessage(null)).toBe(false)
    expect(isWireMessage('ping')).toBe(false)
    expect(isWireMessage({ t: 'nope' })).toBe(false)
    expect(isWireMessage({})).toBe(false)
  })
})
