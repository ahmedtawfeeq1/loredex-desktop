import { beforeEach, describe, expect, it } from 'vitest'
import { useApp } from './stores/app'
import { absVaultPath } from './vaultPaths'

const setVault = (vaultPath: string | null): void => {
  useApp.setState({
    identity: vaultPath === null ? null : ({ vaultPath } as never),
  })
}

beforeEach(() => setVault(null))

describe('absVaultPath — what a "Copy path" button produces', () => {
  it('joins the vault root to a vault-relative path', () => {
    setVault('/Users/x/dex')
    expect(absVaultPath('projects/arabicss/brief.md')).toBe('/Users/x/dex/projects/arabicss/brief.md')
  })
  it('does not double the separator on a vault root that ends in one', () => {
    setVault('/Users/x/dex/')
    expect(absVaultPath('README.md')).toBe('/Users/x/dex/README.md')
  })
  it('leaves an already-absolute path alone', () => {
    setVault('/Users/x/dex')
    expect(absVaultPath('/tmp/elsewhere.md')).toBe('/tmp/elsewhere.md')
  })
  it('with no vault open, returns the input rather than inventing a root path', () => {
    // '/projects/x.md' would read as a real absolute path and get pasted as fact
    expect(absVaultPath('projects/x.md')).toBe('projects/x.md')
  })
})
