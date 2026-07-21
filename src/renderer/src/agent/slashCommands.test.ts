import { describe, expect, it } from 'vitest'
import type { AcpCommand } from '../../../shared/ipc-contract'
import { filterCommands, slashQuery , commandArgs, recognizedCommand } from './slashCommands'

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

describe('recognizedCommand — survives arguments (the /compact case)', () => {
  const cmds = [
    { name: 'compact', description: 'Free up context by summarizing' },
    { name: 'clear', description: 'Clear the conversation' },
  ]

  it('recognizes a bare command', () => {
    expect(recognizedCommand('/compact', cmds)?.name).toBe('compact')
  })

  /**
   * The actual bug: slashQuery is `^\/(\S*)$`, so the moment an argument is
   * typed the draft stops being one token, the menu closes, and nothing shows
   * it is still a command.
   */
  it('STILL recognizes it once arguments are typed', () => {
    expect(recognizedCommand('/compact focus on the webhook work', cmds)?.name).toBe('compact')
    expect(recognizedCommand('/compact ', cmds)?.name).toBe('compact')
  })

  it('does not recognize an unknown command', () => {
    expect(recognizedCommand('/nope', cmds)).toBeNull()
    expect(recognizedCommand('/nope with args', cmds)).toBeNull()
  })

  it('does not fire on ordinary prose that merely contains a slash', () => {
    expect(recognizedCommand('use the /compact command later', cmds)).toBeNull()
    expect(recognizedCommand('', cmds)).toBeNull()
  })

  it('is case-insensitive on the name', () => {
    expect(recognizedCommand('/COMPACT', cmds)?.name).toBe('compact')
  })

  it('extracts the argument text for the hint', () => {
    expect(commandArgs('/compact focus on webhooks')).toBe('focus on webhooks')
    expect(commandArgs('/compact')).toBe('')
  })
})
