/** Story 13.2: loredex://join deep-link parsing — remote/branch params. */
import { describe, expect, it } from 'vitest'
import { parseJoinLink } from './join-link'

describe('parseJoinLink', () => {
  it('parses remote and optional branch', () => {
    expect(
      parseJoinLink('loredex://join?remote=git%40github.com%3Ateam%2Fvault.git&branch=main'),
    ).toEqual({ remote: 'git@github.com:team/vault.git', branch: 'main' })
    expect(parseJoinLink('loredex://join?remote=https://github.com/t/v.git')).toEqual({
      remote: 'https://github.com/t/v.git',
    })
  })

  it('accepts the no-slashes spelling', () => {
    expect(parseJoinLink('loredex:join?remote=https://x.test/v.git')).toEqual({
      remote: 'https://x.test/v.git',
    })
  })

  it('rejects other protocols, actions, and missing remote', () => {
    expect(parseJoinLink('https://join?remote=x')).toBeNull()
    expect(parseJoinLink('loredex://open?remote=x')).toBeNull()
    expect(parseJoinLink('loredex://join')).toBeNull()
    expect(parseJoinLink('loredex://join?remote=')).toBeNull()
    expect(parseJoinLink('not a url')).toBeNull()
  })
})
