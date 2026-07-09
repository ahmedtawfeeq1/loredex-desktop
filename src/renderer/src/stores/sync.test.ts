/** Story 5.2: warning ring buffer + sync dot tone mapping (pure store logic). */
import { describe, expect, it } from 'vitest'
import type { SyncHealth } from '../../../shared/types'
import { dotTone, pushWarning, WARNING_LOG_MAX } from './sync'

const entry = (text: string): { at: string; text: string } => ({
  at: '2026-07-09T12:00:00Z',
  text,
})

describe('pushWarning ring buffer', () => {
  it('prepends newest first and caps at the max', () => {
    let log: ReturnType<typeof pushWarning> = []
    for (let i = 0; i < WARNING_LOG_MAX + 10; i++) log = pushWarning(log, entry(`w${i}`))
    expect(log).toHaveLength(WARNING_LOG_MAX)
    expect(log[0]?.text).toBe(`w${WARNING_LOG_MAX + 9}`)
  })
  it('collapses consecutive duplicates (poll noise)', () => {
    let log = pushWarning([], entry('same'))
    log = pushWarning(log, entry('same'))
    expect(log).toHaveLength(1)
    log = pushWarning(log, entry('other'))
    log = pushWarning(log, entry('same'))
    expect(log.map((e) => e.text)).toEqual(['same', 'other', 'same'])
  })
})

const health = (over: Partial<SyncHealth>): SyncHealth => ({
  state: 'ok',
  branch: 'main',
  canonicalBranch: 'main',
  branchMatches: true,
  remote: 'origin',
  remoteReachable: true,
  ahead: 0,
  behind: 0,
  mergeDriverInstalled: true,
  gitattributesValid: true,
  lastPull: null,
  lastPush: null,
  warnings: [],
  ...over,
})

describe('dotTone (DESIGN.md sync dot semantics)', () => {
  it('ink when clean or unknown', () => {
    expect(dotTone(null)).toBe('ink')
    expect(dotTone(health({}))).toBe('ink')
  })
  it('amber when ahead/behind/diverged', () => {
    expect(dotTone(health({ state: 'ahead', ahead: 2 }))).toBe('amber')
    expect(dotTone(health({ state: 'behind', behind: 1 }))).toBe('amber')
    expect(dotTone(health({ state: 'diverged', ahead: 1, behind: 1 }))).toBe('amber')
  })
  it('rust on error or unreachable remote', () => {
    expect(dotTone(health({ state: 'error' }))).toBe('rust')
    expect(dotTone(health({ remoteReachable: false }))).toBe('rust')
  })
})
