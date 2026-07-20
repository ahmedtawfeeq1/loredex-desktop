/** BL-11: version comparison for the update banner — must never nag wrongly. */
import { describe, expect, it } from 'vitest'
import { isNewer, parseVersion } from './updateCheck'

describe('parseVersion', () => {
  it('strips a leading v and splits core vs pre-release', () => {
    expect(parseVersion('v0.9.7')).toEqual({ nums: [0, 9, 7], pre: '' })
    expect(parseVersion('0.9.4-agentops.3')).toEqual({ nums: [0, 9, 4], pre: 'agentops.3' })
  })
})

describe('isNewer', () => {
  it('compares numerically, not lexically', () => {
    expect(isNewer('v0.9.10', '0.9.9')).toBe(true) // 10 > 9, not "10" < "9"
    expect(isNewer('v0.10.0', '0.9.9')).toBe(true)
    expect(isNewer('v0.9.6', '0.9.7')).toBe(false)
  })

  it('is false for the same version (no nagging on an up-to-date app)', () => {
    expect(isNewer('v0.9.7', '0.9.7')).toBe(false)
    expect(isNewer('0.9.7', 'v0.9.7')).toBe(false)
  })

  it('treats a release as newer than its own pre-release, never the reverse', () => {
    expect(isNewer('v0.9.4', '0.9.4-agentops.9')).toBe(true)
    expect(isNewer('v0.9.4-agentops.9', '0.9.4')).toBe(false)
  })

  it('orders two pre-releases of the same core', () => {
    expect(isNewer('v0.9.4-agentops.9', '0.9.4-agentops.8')).toBe(true)
    expect(isNewer('v0.9.4-agentops.8', '0.9.4-agentops.9')).toBe(false)
  })

  it('never claims newer on garbage input', () => {
    expect(isNewer('', '0.9.7')).toBe(false)
    expect(isNewer('not-a-version', '0.9.7')).toBe(false)
  })
})
