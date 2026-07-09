import { describe, expect, it } from 'vitest'
import { ipcError, isErrEnvelope, isWireMessage } from './ipc-contract'

describe('wire message codec', () => {
  it('accepts ping and pong', () => {
    expect(isWireMessage({ t: 'ping' })).toBe(true)
    expect(isWireMessage({ t: 'pong' })).toBe(true)
  })

  it('accepts req/res/evt shapes', () => {
    expect(isWireMessage({ t: 'req', id: 1, ch: 'config.get', arg: undefined })).toBe(true)
    expect(isWireMessage({ t: 'res', id: 1, ok: true, out: {} })).toBe(true)
    expect(isWireMessage({ t: 'evt', event: { kind: 'git.warning', text: 'x' } })).toBe(true)
  })

  it('rejects malformed messages', () => {
    expect(isWireMessage(null)).toBe(false)
    expect(isWireMessage('ping')).toBe(false)
    expect(isWireMessage({ t: 'nope' })).toBe(false)
    expect(isWireMessage({ t: 'req', ch: 'x' })).toBe(false) // missing id
    expect(isWireMessage({})).toBe(false)
  })
})

describe('error envelope', () => {
  it('round-trips through the guard', () => {
    const err = ipcError('NOT_IMPLEMENTED', 'nope', { extra: 1 })
    expect(isErrEnvelope(err)).toBe(true)
    expect(isErrEnvelope({ code: 'X' })).toBe(false)
    expect(isErrEnvelope(new Error('raw'))).toBe(false)
  })
})
