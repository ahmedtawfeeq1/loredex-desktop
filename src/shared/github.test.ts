/**
 * Story 12.1 AC5: the ONE remote→web-base normalization — ssh, https, .git,
 * enterprise host, non-GitHub, absent remote — plus the URL/slug builders.
 */
import { describe, expect, it } from 'vitest'
import { commitUrl, githubRepoSlug, githubWebBase, shortSha } from './github'

describe('githubWebBase (story 12.1 normalization matrix)', () => {
  it('normalizes https remotes, with and without .git / trailing slash', () => {
    expect(githubWebBase('https://github.com/acme/nimbus.git')).toBe(
      'https://github.com/acme/nimbus',
    )
    expect(githubWebBase('https://github.com/acme/nimbus')).toBe('https://github.com/acme/nimbus')
    expect(githubWebBase('https://github.com/acme/nimbus/')).toBe('https://github.com/acme/nimbus')
  })

  it('normalizes ssh remotes (scp-style and ssh://)', () => {
    expect(githubWebBase('git@github.com:acme/nimbus.git')).toBe('https://github.com/acme/nimbus')
    expect(githubWebBase('ssh://git@github.com/acme/nimbus.git')).toBe(
      'https://github.com/acme/nimbus',
    )
  })

  it('returns null for non-GitHub hosts — chips render plain, never broken', () => {
    expect(githubWebBase('git@gitlab.com:acme/nimbus.git')).toBeNull()
    expect(githubWebBase('https://bitbucket.org/acme/nimbus.git')).toBeNull()
    // GitHub Enterprise is a non-GitHub host for this cycle (m2 §6 verbatim)
    expect(githubWebBase('git@github.acme-corp.com:acme/nimbus.git')).toBeNull()
    expect(githubWebBase('https://github.acme-corp.com/acme/nimbus')).toBeNull()
  })

  it('returns null for absent or unparseable remotes', () => {
    expect(githubWebBase(null)).toBeNull()
    expect(githubWebBase('')).toBeNull()
    expect(githubWebBase('/local/bare/repo.git')).toBeNull()
  })
})

describe('url + slug builders', () => {
  it('commitUrl builds the commit page URL', () => {
    expect(commitUrl('https://github.com/acme/nimbus', 'abc1234')).toBe(
      'https://github.com/acme/nimbus/commit/abc1234',
    )
  })

  it('githubRepoSlug yields owner/repo for gh --repo; null when not GitHub', () => {
    expect(githubRepoSlug('git@github.com:acme/nimbus.git')).toBe('acme/nimbus')
    expect(githubRepoSlug('git@gitlab.com:acme/nimbus.git')).toBeNull()
    expect(githubRepoSlug(null)).toBeNull()
  })

  it('shortSha is the 7-char display form', () => {
    expect(shortSha('0123456789abcdef0123456789abcdef01234567')).toBe('0123456')
  })
})
