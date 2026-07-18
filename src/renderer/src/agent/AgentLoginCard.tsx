/**
 * B1 login card — the one-click "Log in with X" affordance (LOCKED DECISION).
 * For the subscription providers (claude, codex) ACP login is a TERMINAL-type
 * auth method: clicking opens the embedded terminal drawer and runs the
 * user-facing CLI login (`claude /login`, `codex login`) — the browser opens
 * exactly like an IDE, so the SAME subscription is reused with no API key. The
 * API-key path lives in Settings › AI providers (agent.auth.*). Gemini is
 * architect-only this round (auth in flux, self-installed CLI), so it has no
 * terminal login command here.
 *
 * NOT a cobalt primary — Send owns the one-per-view (design law); this is a
 * hairline accent call-to-action, matching the continue chips.
 */
import type { AcpAgent } from '../../../shared/ipc-contract'
import { useTerminal } from '../stores/terminal'

/** The user-facing CLI login command per terminal-auth provider. Self-contained
 *  (no import from AgentPanel) to avoid a render-order module cycle. */
const LOGIN: Partial<Record<AcpAgent, { label: string; command: string }>> = {
  claude: { label: 'Claude', command: 'claude /login' },
  codex: { label: 'Codex', command: 'codex login' },
}

export function AgentLoginCard({ agent }: { agent: AcpAgent }): React.JSX.Element {
  const login = LOGIN[agent]
  if (!login) {
    // gemini (architect-only): no bundled terminal login — point at its own CLI
    // or the Settings API-key field.
    return (
      <div className="agent-login">
        <span className="agent-login-hint">
          Install this provider’s CLI, or add an API key in Settings › AI providers.
        </span>
      </div>
    )
  }
  return (
    <div className="agent-login">
      <button
        type="button"
        className="agent-login-btn"
        title={`Open the terminal and run ${login.command}`}
        onClick={() => void useTerminal.getState().runCommand(login.command)}
      >
        Log in with {login.label}
      </button>
      <span className="agent-login-hint">
        Opens the terminal and runs <span className="mono">{login.command}</span> — finish in your
        browser, then start a new session.
      </span>
    </div>
  )
}
