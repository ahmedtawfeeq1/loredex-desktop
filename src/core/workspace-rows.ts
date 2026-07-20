/**
 * The Settings row model for workspace MCP servers — pure, so the seam contract
 * is unit-testable without a live core host.
 */
import { isN8nInstalled } from './n8n-install'

export interface WorkspaceRow {
  id: 'loredex' | 'n8n'
  label: string
  enabled: boolean
  installed: boolean
  mode: 'documentation' | 'full' | null
}

export function workspaceServerRows(
  enabled: { loredex: boolean; n8n: boolean },
  n8n: { hasKey: boolean; url: string | null },
): WorkspaceRow[] {
  return [
    {
      id: 'loredex',
      label: 'loredex',
      enabled: enabled.loredex,
      installed: true, // ours, always present
      mode: null,
    },
    {
      id: 'n8n',
      label: 'n8n',
      enabled: enabled.n8n,
      installed: isN8nInstalled(),
      // a key WITHOUT a url cannot authenticate — that is still documentation mode
      mode: n8n.hasKey && n8n.url ? 'full' : 'documentation',
    },
  ]
}
