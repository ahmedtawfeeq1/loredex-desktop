/** Story 3.4 (AC4): identity travels with the command, never ambient config. */
import { describe, expect, it } from 'vitest'
import { gitIdentityArgs, gitIdentityEnv, withGitIdentity } from './git'

const dana = { name: 'Dana Reyes', email: 'dana@nimbus.dev' }

describe('git identity injection', () => {
  it('builds per-command -c args', () => {
    expect(gitIdentityArgs(dana)).toEqual([
      '-c',
      'user.name=Dana Reyes',
      '-c',
      'user.email=dana@nimbus.dev',
    ])
  })

  it('builds author + committer env overrides', () => {
    expect(gitIdentityEnv(dana)).toEqual({
      GIT_AUTHOR_NAME: 'Dana Reyes',
      GIT_AUTHOR_EMAIL: 'dana@nimbus.dev',
      GIT_COMMITTER_NAME: 'Dana Reyes',
      GIT_COMMITTER_EMAIL: 'dana@nimbus.dev',
    })
  })

  it('withGitIdentity scopes the env to the call and restores prior values', () => {
    process.env.GIT_AUTHOR_NAME = 'previous'
    delete process.env.GIT_COMMITTER_EMAIL
    const seen = withGitIdentity(dana, () => ({
      author: process.env.GIT_AUTHOR_NAME,
      committer: process.env.GIT_COMMITTER_EMAIL,
    }))
    expect(seen).toEqual({ author: 'Dana Reyes', committer: 'dana@nimbus.dev' })
    expect(process.env.GIT_AUTHOR_NAME).toBe('previous')
    expect(process.env.GIT_COMMITTER_EMAIL).toBeUndefined()
    delete process.env.GIT_AUTHOR_NAME
  })

  it('restores env even when the wrapped call throws', () => {
    delete process.env.GIT_AUTHOR_NAME
    expect(() =>
      withGitIdentity(dana, () => {
        throw new Error('boom')
      }),
    ).toThrow('boom')
    expect(process.env.GIT_AUTHOR_NAME).toBeUndefined()
  })
})
