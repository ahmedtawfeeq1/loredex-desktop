import { describe, expect, it } from 'vitest'
import type { AcpCommand } from '../../../shared/ipc-contract'
import { filterCommands, slashQuery } from './slashCommands'

const cmd = (name: string): AcpCommand => ({ name, description: `${name} desc` })
const CMDS = [cmd('commit'), cmd('compact'), cmd('review'), cmd('recommit'), cmd('verify')]

describe('slashQuery', () => {
  it('opens on a bare /token, closes once args begin or no slash', () => {
    expect(slashQuery('/')).toBe('') // lone slash → show all
    expect(slashQuery('/com')).toBe('com')
    expect(slashQuery('/commit')).toBe('commit')
    expect(slashQuery('/commit ')).toBeNull() // space = writing args
    expect(slashQuery('/commit msg')).toBeNull()
    expect(slashQuery('hello')).toBeNull()
    expect(slashQuery('a /commit')).toBeNull() // slash not at start
    expect(slashQuery('')).toBeNull()
  })
})

describe('filterCommands', () => {
  it('empty query returns the first N', () => {
    expect(filterCommands(CMDS, '', 3).map((c) => c.name)).toEqual(['commit', 'compact', 'review'])
  })
  it('prefix matches rank before substring matches', () => {
    // "com" prefixes commit/compact; "recommit" only contains it
    expect(filterCommands(CMDS, 'com').map((c) => c.name)).toEqual(['commit', 'compact', 'recommit'])
  })
  it('is case-insensitive and caps results', () => {
    expect(filterCommands(CMDS, 'COMMIT').map((c) => c.name)).toEqual(['commit', 'recommit'])
    expect(filterCommands(CMDS, '', 2)).toHaveLength(2)
  })
  it('no match → empty', () => {
    expect(filterCommands(CMDS, 'zzz')).toEqual([])
  })
})
