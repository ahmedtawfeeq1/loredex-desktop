import { describe, expect, it } from 'vitest'
import { abbreviatePath, formatVaultIdentity, vaultName } from './identity'
import type { VaultIdentity } from './types'

const identity: VaultIdentity = {
  vaultPath: '/Users/kim/team/nimbus-vault',
  displayPath: '~/team/nimbus-vault',
  configSource: 'vault-picker',
  remote: 'git@github.com:acme/nimbus-vault.git',
  engineVersion: '2.0.0',
}

describe('formatVaultIdentity (badge + MCP echo share these strings)', () => {
  it('abbreviates the home dir and never a foreign prefix', () => {
    expect(abbreviatePath('/Users/kim/v', '/Users/kim')).toBe('~/v')
    expect(abbreviatePath('/Users/kimberly/v', '/Users/kim')).toBe('/Users/kimberly/v')
    expect(abbreviatePath('/srv/vault', '/Users/kim')).toBe('/srv/vault')
  })

  it('derives the vault display name from the last path segment', () => {
    expect(vaultName(identity)).toBe('nimbus-vault')
  })

  it('formats path, engine version, config source and remote on one line', () => {
    const line = formatVaultIdentity(identity, '/Users/kim')
    expect(line).toBe(
      '~/team/nimbus-vault · engine loredex 2.0.0 · source: vault-picker · remote: git@github.com:acme/nimbus-vault.git',
    )
    expect(formatVaultIdentity({ ...identity, remote: null }, '/Users/kim')).toContain('no remote')
  })
})
