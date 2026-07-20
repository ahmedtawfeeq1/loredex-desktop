/**
 * Workspace MCP servers — the ones that belong to the vault rather than to one
 * client. Tools are expanded by default and read live from the running server,
 * so the list here cannot drift from what an agent session actually gets.
 *
 * Anything loredex cannot honestly do itself (the `/plugin install` TUI command,
 * or npm when it is not on the app's PATH) renders as a setup card: the exact
 * command, an Open-terminal button that TYPES it without executing, Copy, and
 * Verify. The card stays rust until the check actually passes — never an
 * optimistic green.
 *
 * Markup follows AgentAuthSection (settings-section card, hairline-separated
 * rows, settings-dot, settings-input, the shared switch) — same design system,
 * no new controls.
 */
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { useApp } from '../../stores/app'
import { useTerminal } from '../../stores/terminal'
import { useWorkspaceMcp } from '../../stores/workspaceMcp'

function SetupCard({
  title,
  note,
  command,
  done,
  onVerify,
}: {
  title: string
  note: string
  command: string
  done: boolean
  onVerify: () => void
}): React.JSX.Element {
  return (
    <div className={`ws-setup${done ? ' is-done' : ''}`}>
      <div className="ws-setup-head">
        <span className={`settings-dot ${done ? 'dot-ok' : 'dot-rust'}`} aria-hidden="true" />
        <span className="ws-setup-title">{title}</span>
        <span className="ws-setup-note">{done ? 'Installed' : note}</span>
      </div>
      {!done && (
        <>
          <pre className="ws-setup-cmd" dir="ltr">
            {command}
          </pre>
          <div className="ws-setup-actions">
            <Button
              variant="secondary"
              onClick={() => {
                // Open the terminal at the vault root and TYPE the command
                // without a newline — the user reviews it and presses Enter. We
                // never auto-execute something we just asked them to check.
                const vaultPath = useApp.getState().identity?.vaultPath
                void useTerminal
                  .getState()
                  .openAt(vaultPath ?? '')
                  .then(() => useTerminal.getState().typeIntoActive(command))
              }}
            >
              Open terminal
            </Button>
            <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(command)}>
              Copy
            </Button>
            <Button variant="secondary" onClick={onVerify}>
              Verify
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

export function WorkspaceServersSection(): React.JSX.Element {
  const rows = useWorkspaceMcp((s) => s.rows)
  const tools = useWorkspaceMcp((s) => s.tools)
  const skills = useWorkspaceMcp((s) => s.skills)
  const busy = useWorkspaceMcp((s) => s.busy)
  const saved = useWorkspaceMcp((s) => s.saved)
  const verifying = useWorkspaceMcp((s) => s.verifying)
  const storedHasKey = useWorkspaceMcp((s) => s.n8n?.hasKey ?? false)
  const error = useWorkspaceMcp((s) => s.error)
  const [url, setUrl] = useState('')
  // The URL is not a secret and IS persisted, but the field never seeded from
  // it — so a saved instance looked empty on every visit, exactly like a save
  // that had failed. Seed once the status arrives, without clobbering typing.
  const storedUrl = useWorkspaceMcp((s) => s.n8n?.url ?? null)
  useEffect(() => {
    if (storedUrl) setUrl((cur) => (cur === '' ? storedUrl : cur))
  }, [storedUrl])
  const [key, setKey] = useState('')
  const [installMsg, setInstallMsg] = useState<string | null>(null)
  const [installCmd, setInstallCmd] = useState<string | null>(null)

  useEffect(() => {
    void useWorkspaceMcp.getState().load()
  }, [])

  const n8n = rows.find((r) => r.id === 'n8n')

  return (
    <div className="settings-section ws-section">
      <h2 className="settings-title">Workspace servers</h2>
      <p className="settings-hint">
        These belong to the whole vault — not to one client. Every agent session gets them.
      </p>

      {rows.map((row) => {
        const t = tools[row.id]
        return (
          <div className="ws-row" key={row.id}>
            <div className="ws-row-head">
              <span
                className={`settings-dot ${row.enabled && row.installed ? 'dot-ok' : ''}`}
                aria-hidden="true"
              />
              <span className="ws-row-name">{row.label}</span>
              {row.mode && (
                <span className="ws-mode">
                  {row.mode === 'full' ? 'Full access' : 'Documentation tools only'}
                </span>
              )}
              <span className="ws-row-spacer" />
              <button
                type="button"
                role="switch"
                aria-checked={row.enabled}
                aria-label={`Enable ${row.label}`}
                className={`switch${row.enabled ? ' is-on' : ''}`}
                onClick={() => void useWorkspaceMcp.getState().setEnabled(row.id, !row.enabled)}
              >
                <span className="switch-knob" />
              </button>
            </div>

            {row.installed ? (
              t ? (
                t.ok ? (
                  <ul className="ws-tools">
                    {t.tools.map((name) => (
                      <li key={name}>{name}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="ws-tools-err">Could not read tools — {t.detail}</p>
                )
              ) : (
                <p className="ws-tools-err">Reading tools…</p>
              )
            ) : (
              <>
                <p className="settings-hint">
                  Not installed. Downloads about 154&nbsp;MB once, into this app’s data folder.
                </p>
                <div className="ws-setup-actions">
                  <Button
                    variant="primary"
                    disabled={busy}
                    onClick={() =>
                      void useWorkspaceMcp
                        .getState()
                        .install()
                        .then((r) => {
                          setInstallMsg(r.detail)
                          setInstallCmd(r.ok ? null : r.command)
                        })
                    }
                  >
                    {busy ? 'Installing…' : 'Install'}
                  </Button>
                </div>
                {installMsg && <p className="ws-tools-err">{installMsg}</p>}
                {installCmd && (
                  <SetupCard
                    title="Install it from a terminal"
                    note="npm was not reachable from the app"
                    command={installCmd}
                    done={false}
                    onVerify={() => void useWorkspaceMcp.getState().load()}
                  />
                )}
              </>
            )}
          </div>
        )
      })}

      <h3 className="settings-title ws-subtitle">n8n instance</h3>
      <p className="settings-hint">
        Optional. Without it you get n8n’s documentation and validation tools; with it, workflow
        creation, execution and analysis too. The key is stored in your OS keychain — never in the
        vault or a commit.
      </p>
      <label className="settings-field ws-field">
        <span>Instance URL</span>
        <input
          className="settings-input"
          type="url"
          placeholder="https://n8n.example.com"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
        />
      </label>
      <label className="settings-field ws-field">
        <span>API key</span>
        <input
          className="settings-input"
          type="password"
          placeholder={
            storedHasKey ? 'Stored — paste a new key to replace it' : 'n8n API key (optional)'
          }
          value={key}
          onChange={(e) => setKey(e.target.value)}
        />
      </label>
      <div className="ws-setup-actions">
        <Button
          variant="primary"
          disabled={!url.trim() && !key.trim()}
          onClick={() =>
            void useWorkspaceMcp
              .getState()
              .saveN8n(url.trim() || null, key.trim() || null)
              .then(() => setKey(''))
          }
        >
          Save n8n settings
        </Button>
        {/* the button previously cleared the key field with no confirmation, so
            a successful save was indistinguishable from nothing happening */}
        {saved && !error && <span className="ws-saved">Saved — key stored in your keychain</span>}
        {error && <span className="ws-error">{error}</span>}
      </div>

      <h3 className="settings-title ws-subtitle">n8n skills (Claude only)</h3>
      <p className="settings-hint">
        Skills that teach Claude n8n’s expression syntax, node configuration and workflow patterns.
        Codex and Gemini ignore skills — the n8n <em>tools</em> above still work in all three.
      </p>
      {skills && (
        <SetupCard
          title="n8n skills plugin"
          note="Run this inside a claude session"
          command={skills.command}
          done={skills.installed}
          onVerify={() => void useWorkspaceMcp.getState().verifySkills()}
        />
      )}

      <h3 className="settings-title ws-subtitle">n8n in the terminal</h3>
      <p className="settings-hint">
        The agent panel already has n8n — this is only for <span className="mono">claude</span> run
        in a terminal, which reads its own config. <b>Heads up:</b> this command stores your API key
        in <span className="mono">~/.claude.json</span> in plain text; the agent panel keeps it in
        your OS keychain instead. Replace the placeholder with your real key before running it —
        loredex does not put your stored key into this command.
      </p>
      {skills && (
        <SetupCard
          title="n8n MCP for terminal claude"
          command={skills.terminal.command}
          // null = never checked. The check costs ~12s (claude mcp list
          // health-checks every configured MCP server), so it is Verify-driven
          // and this card starts in an honest "unknown" state rather than
          // claiming "not installed" on no evidence.
          done={skills.terminal.installed === true}
          note={
            skills.terminal.installed === null
              ? verifying
                ? 'Checking… (this asks claude to health-check every MCP server)'
                : 'Not checked yet — press Verify'
              : 'Not registered with your claude CLI'
          }
          onVerify={() => void useWorkspaceMcp.getState().verifyTerminal()}
        />
      )}
    </div>
  )
}
