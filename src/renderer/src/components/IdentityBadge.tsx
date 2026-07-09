/**
 * Vault identity chip — bottom of sidebar, permanent (the F6 fix made
 * visible). Vault name + path + engine version + config source; full
 * identity incl. remote in the tooltip. Sync dot: ink = clean (sync states
 * arrive with later stories).
 */
import { formatVaultIdentity, vaultName } from '../../../shared/identity'
import { useApp } from '../stores/app'

export function IdentityBadge(): React.JSX.Element | null {
  const identity = useApp((s) => s.identity)
  if (!identity) return null
  return (
    <div className="vault-chip" title={formatVaultIdentity(identity)}>
      <span className="vault-chip-dot" aria-hidden />
      <div className="vault-chip-text">
        <span className="vault-chip-name">{vaultName(identity)}</span>
        <span className="vault-chip-meta">{identity.displayPath}</span>
        <span className="vault-chip-meta">
          loredex {identity.engineVersion} · {identity.configSource}
        </span>
      </div>
    </div>
  )
}
