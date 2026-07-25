/**
 * The Settings row model for workspace MCP servers — pure, so the seam contract
 * is unit-testable without a live core host.
 */
import { isN8nInstalled } from './n8n-install'
import type { WorkspaceServerId } from './workspace-mcp'

export interface WorkspaceRow {
  id: WorkspaceServerId
  label: string
  enabled: boolean
  /** ready to run: an npm-installed server is present on disk, a remote one has
   *  a key. False means the row shows its setup instead of its tools. */
  installed: boolean
  mode: 'documentation' | 'full' | null
  /**
   * What "not installed" MEANS for this row, so the UI does not have to know:
   * 'install' — we can fetch it (n8n's npm package);
   * 'key'     — nothing to fetch, it needs a credential (LangSmith is remote);
   * null      — always ready (ours).
   */
  setup: 'install' | 'key' | null
}

export function workspaceServerRows(
  enabled: Record<WorkspaceServerId, boolean>,
  n8n: { hasKey: boolean; url: string | null },
  langsmith: { hasKey: boolean } = { hasKey: false },
): WorkspaceRow[] {
  return [
    {
      id: 'loredex',
      label: 'loredex',
      enabled: enabled.loredex,
      installed: true, // ours, always present
      mode: null,
      setup: null,
    },
    {
      id: 'n8n',
      label: 'n8n',
      enabled: enabled.n8n,
      installed: isN8nInstalled(),
      // a key WITHOUT a url cannot authenticate — that is still documentation mode
      mode: n8n.hasKey && n8n.url ? 'full' : 'documentation',
      setup: 'install',
    },
    {
      id: 'langsmith',
      label: 'langsmith',
      enabled: enabled.langsmith,
      // remote: there is no download, so "ready" is exactly "has a key"
      installed: langsmith.hasKey,
      // no documentation-only tier — without a key the server serves nothing
      mode: langsmith.hasKey ? 'full' : null,
      setup: 'key',
    },
  ]
}
