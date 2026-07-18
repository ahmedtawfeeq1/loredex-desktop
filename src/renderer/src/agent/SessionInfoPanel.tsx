/**
 * SessionInfoPanel (acp A7): a collapsed-by-default disclosure under the usage
 * strip that surfaces the session's capabilities — the agent's advertised
 * slash-commands, its current operating mode + a switcher (calls agent.setMode
 * via the store), and the attached MCP servers. The MCP list is name/url ONLY;
 * the per-session bearer token never reaches the renderer (surfaced token-free
 * from acp.ts). Renders nothing until an agent reports at least one of the
 * three — an empty panel helps nobody (the UsageBar precedent).
 */
import { useAgentPanel, type AcpSessionView } from '../stores/agentPanel'

export function SessionInfoPanel({
  session,
}: {
  session: AcpSessionView
}): React.JSX.Element | null {
  const { commands, mode, mcpServers } = session
  const hasCommands = !!commands && commands.length > 0
  const hasModes = !!mode && !!mode.availableModes && mode.availableModes.length > 0
  const hasMcp = !!mcpServers && mcpServers.length > 0
  if (!hasCommands && !hasModes && !hasMcp) return null

  // compact summary counts so the collapsed line says what's inside
  const parts: string[] = []
  if (hasModes) parts.push(mode.availableModes!.find((m) => m.id === mode.currentModeId)?.name ?? 'mode')
  if (hasCommands) parts.push(`${commands!.length} command${commands!.length === 1 ? '' : 's'}`)
  if (hasMcp) parts.push(`${mcpServers!.length} MCP`)

  return (
    <details className="agent-info">
      <summary className="agent-info-summary">
        <span className="agent-info-summary-label">SESSION</span>
        <span className="agent-info-summary-count">{parts.join(' · ')}</span>
      </summary>
      <div className="agent-info-body">
        {hasModes && (
          <div className="agent-info-section">
            <div className="agent-info-head">Mode</div>
            <div
              className="seg-control agent-info-modes"
              role="group"
              aria-label="Session mode"
            >
              {mode.availableModes!.map((m) => {
                const current = m.id === mode.currentModeId
                return (
                  <button
                    key={m.id}
                    type="button"
                    className="seg-option agent-info-mode"
                    aria-pressed={current}
                    title={m.description ?? m.name}
                    onClick={() =>
                      void useAgentPanel.getState().setMode(session.sessionId, m.id)
                    }
                  >
                    {m.name}
                  </button>
                )
              })}
            </div>
          </div>
        )}
        {hasCommands && (
          <div className="agent-info-section">
            <div className="agent-info-head">Commands</div>
            <ul className="agent-info-cmds">
              {commands!.map((c) => (
                <li key={c.name} className="agent-info-cmd">
                  <span className="agent-info-cmd-name">/{c.name}</span>
                  <span className="agent-info-cmd-desc">{c.description}</span>
                  {c.hint && <span className="agent-info-cmd-hint">{c.hint}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}
        {hasMcp && (
          <div className="agent-info-section">
            <div className="agent-info-head">MCP servers</div>
            <ul className="agent-info-mcps">
              {mcpServers!.map((m) => (
                <li key={m.name} className="agent-info-mcp">
                  <span className="agent-info-mcp-name">{m.name}</span>
                  {m.url && (
                    <span className="agent-info-mcp-url" title={m.url}>
                      {m.url}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </details>
  )
}
