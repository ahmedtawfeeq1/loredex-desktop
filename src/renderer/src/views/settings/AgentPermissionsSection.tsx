/**
 * WP-B: manage the saved always-allow rules. Each rule auto-answers a
 * permission request whose (client, tool kind) matches — created from the
 * modal's 'always allow' toggle. Here you only review + revoke them. Agent-ops
 * dexes only (the nav entry is filtered by dex type in SettingsView).
 */
import { useEffect, useState } from 'react'
import type { PermissionRule } from '../../../../shared/ipc-contract'
import { invoke } from '../../api'

export function AgentPermissionsSection(): React.JSX.Element {
  const [rules, setRules] = useState<PermissionRule[]>([])
  const [refresh, setRefresh] = useState(0)

  useEffect(() => {
    void invoke('agent.permissions.list', undefined)
      .then(setRules)
      .catch(() => setRules([]))
  }, [refresh])

  async function remove(rule: PermissionRule): Promise<void> {
    try {
      await invoke('agent.permissions.remove', { client: rule.client, toolKind: rule.toolKind })
      setRefresh((n) => n + 1)
    } catch {
      // best-effort
    }
  }

  return (
    <div className="settings-section">
      <p className="settings-help">
        Always-allow rules auto-approve an agent's tool request when its client and tool kind match
        — created from the “Always allow” toggle on a permission request. Removing one restores the
        prompt.
      </p>
      {rules.length === 0 ? (
        <div className="settings-empty">No always-allow rules yet.</div>
      ) : (
        <div className="perm-table">
          <div className="perm-thead" role="row">
            <span className="perm-client">CLIENT</span>
            <span className="perm-kind">TOOL KIND</span>
            <span className="perm-act" />
          </div>
          {rules.map((r) => (
            <div key={`${r.client}/${r.toolKind}`} className="perm-tr" role="row">
              <span className="perm-client">
                <span className="agent-client-chip">◈ {r.client}</span>
              </span>
              <span className="perm-kind">{r.toolKind}</span>
              <span className="perm-act">
                <button
                  type="button"
                  className="button-secondary button-small"
                  title={`Stop auto-approving ${r.toolKind} for ${r.client}`}
                  onClick={() => void remove(r)}
                >
                  Remove
                </button>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
