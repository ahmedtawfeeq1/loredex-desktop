/**
 * Vault identity chip — bottom of sidebar, permanent (the F6 fix made
 * visible). Vault name + path + engine version + config source; full
 * identity incl. remote in the tooltip. Sync dot semantics (story 5.2):
 * ink = clean, amber = ahead/behind, rust = error/offline.
 */
import { formatVaultIdentity, vaultName } from '../../../shared/identity'
import { useApp } from '../stores/app'
import { dotTone, useSync } from '../stores/sync'

export function IdentityBadge(): React.JSX.Element | null {
  const identity = useApp((s) => s.identity)
  const tone = useSync((s) => dotTone(s.health))
  if (!identity) return null
  return (
    <div className="vault-chip" title={formatVaultIdentity(identity)}>
      <span className={`vault-chip-dot sync-dot-${tone}`} aria-hidden />
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
