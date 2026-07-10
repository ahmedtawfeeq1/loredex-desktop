/**
 * Drift badge (epic4.story4): when a routed note's vault copy is behind its
 * source (live source body no longer matches the stamped source_hash), show a
 * rust badge with one-click Re-route. Re-route opens the ordinary confirm card
 * on the source path — the WRITE goes through the lib plan/apply, never here.
 * Read-only drift query; nothing renders for in-sync or non-routed notes.
 */
import { useEffect, useState } from 'react'
import { invoke } from '../api'
import { useRoute } from '../stores/route'

interface Drift {
  stale: boolean
  source?: string
}

export function DriftBadge({ path }: { path: string }): React.JSX.Element | null {
  const [drift, setDrift] = useState<Drift | null>(null)

  useEffect(() => {
    let live = true
    setDrift(null)
    void invoke('vault.drift', { path })
      .then((d) => {
        if (live) setDrift(d)
      })
      .catch(() => {})
    return () => {
      live = false
    }
  }, [path])

  if (!drift?.stale) return null
  return (
    <div className="drift-badge" role="status">
      <span className="drift-dot" aria-hidden />
      <span>Vault copy is behind its source</span>
      {drift.source && (
        <button
          type="button"
          className="drift-reroute"
          onClick={() => void useRoute.getState().startWithFile(drift.source as string)}
        >
          Re-route
        </button>
      )}
    </div>
  )
}
