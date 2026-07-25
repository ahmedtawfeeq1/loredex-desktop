/**
 * Vault-wide integrations — one collapsible card each.
 *
 * ORGANISED BY INTEGRATION, NOT BY KIND (2026-07-23). It used to be every
 * server, then every credential form, then every skills card, then every
 * terminal card — so working on "the automation platform" meant four places with
 * LangSmith's settings sitting in between. Tabs by kind were considered and
 * rejected: they split n8n across three tabs, which is the same mixing rotated
 * 90°. Adding an integration is now one new card, not an edit in four sections.
 *
 * What a card shows when opened is the enable state, the credentials and Test —
 * what you touch when something is wrong. The live tool list and the setup cards
 * are behind **Advanced**: still one click, but not ~24 tool chips per
 * integration on the way to a text field.
 *
 * Tools are still read LIVE from the running server, so the list cannot drift
 * from what an agent session actually gets.
 *
 * Anything loredex cannot honestly do itself (the `/plugin install` TUI command,
 * or npm when it is not on the app's PATH) renders as a setup card: the exact
 * command, per-step Copy, and Verify. The card stays rust until the check
 * actually passes — never an optimistic green.
 *
 * Markup follows AgentAuthSection (settings-section card, hairline-separated
 * rows, settings-dot, settings-input, the shared switch) — same design system,
 * no new controls.
 */
import { useEffect, useState } from 'react'
import type { CoreApi } from '../../../../shared/ipc-contract'
import { Button } from '../../components/Button'
import { useApp } from '../../stores/app'
import { useTerminal } from '../../stores/terminal'
import { useWorkspaceMcp } from '../../stores/workspaceMcp'

type Row = CoreApi['workspace.mcp.list']['out'][number]
type Tools = CoreApi['workspace.mcp.tools']['out']

function SetupCard({
  title,
  note,
  command,
  done,
  onVerify,
  /**
   * When set, `command` is a claude SLASH command and this is the shell command
   * that opens the session it belongs in (`claude`). Typed at a shell instead, a
   * slash command is just `zsh: no such file or directory: /plugin`.
   *
   * This used to be accepted and then IGNORED — the card typed the slash command
   * straight into zsh, which is what the user hit. Now the card only does the one
   * thing it can do reliably: **Open Claude** starts the session. Each step is
   * then copied and pasted by hand. A "Type into the session" button existed
   * briefly and was dropped (2026-07-23) — with Copy right there it earned
   * nothing, and it could only ever type into whichever pty happened to be
   * focused.
   */
  launch,
}: {
  title: string
  note: string
  command: string
  done: boolean
  onVerify: () => void
  launch?: string
}): React.JSX.Element {
  const steps = command.split('\n').filter((l) => l.trim() !== '')
  /** Open the in-app terminal at the vault, then hand it `text`. */
  async function intoTerminal(text: string, enter: boolean): Promise<void> {
    const vaultPath = useApp.getState().identity?.vaultPath
    await useTerminal.getState().openAt(vaultPath ?? '')
    await useTerminal.getState().typeIntoActive(text, enter)
  }

  return (
    <div className={`ws-setup${done ? ' is-done' : ''}`}>
      <div className="ws-setup-head">
        <span className={`settings-dot ${done ? 'dot-ok' : 'dot-rust'}`} aria-hidden="true" />
        <span className="ws-setup-title">{title}</span>
        <span className="ws-setup-note">{done ? 'Installed' : note}</span>
      </div>
      {!done && (
        <>
          {launch && (
            <p className="ws-setup-note">
              {steps.length > 1 ? 'These are Claude slash commands' : 'This is a Claude slash command'}
              , not shell commands — they only work <em>inside</em> a{' '}
              <span className="mono">{launch}</span> session. Open Claude, wait for it to start,
              then copy each step in order and paste it in.
            </p>
          )}
          <div className="ws-setup-actions">
            {launch ? (
              <Button variant="secondary" ack="Opening" onClick={() => void intoTerminal(launch, true)}>
                Open Claude
              </Button>
            ) : (
              // a SHELL command (claude mcp add, npm install): the in-app
              // terminal can type it directly — no session to get inside first.
              // Still unexecuted; the user reads it and presses Enter.
              <Button
                variant="secondary"
                ack="Typed"
                onClick={() => void intoTerminal(steps[0] ?? command, false)}
              >
                Open terminal
              </Button>
            )}
          </div>
          {/* One row per command, never one block of several: they are run one
              at a time, and a shared Copy button copied all of them at once —
              useless when what you need is step 2. The text is selectable
              (body sets user-select:none), so a mouse drag works too. */}
          <ol className="ws-setup-steps">
            {steps.map((line, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the same command
              // can appear twice (`/reload-plugins` is step 2 AND step 4), so
              // the text is not a unique key; the list is static per card.
              <li key={`${i}-${line}`} className="ws-setup-step">
                {steps.length > 1 && <span className="ws-setup-step-n">{i + 1}</span>}
                <code className="ws-setup-cmd" dir="ltr">
                  {line}
                </code>
                <span className="ws-setup-step-actions">
                  <Button
                    variant="secondary"
                    className="button-small"
                    ack="Copied"
                    title="Copy this step"
                    onClick={() => void navigator.clipboard.writeText(line)}
                  >
                    Copy
                  </Button>
                </span>
              </li>
            ))}
          </ol>
          <div className="ws-setup-actions">
            <Button variant="secondary" ack="Checked" onClick={onVerify}>
              Verify
            </Button>
          </div>
        </>
      )}
    </div>
  )
}

/**
 * One integration, everything about it in one place.
 *
 * The page used to be organised by KIND — every server, then every credential
 * form, then every skills card — so working on "the automation platform" meant
 * three separate places with LangSmith's settings sitting between them. Grouping
 * by integration is what the page is actually used for; adding a new one is a
 * new card rather than an edit in four sections.
 *
 * Collapsed by default. What opens with it is the ENABLE state, the credentials
 * and Test — the things you touch when something is wrong. The full tool list
 * and the setup cards live behind Advanced: honest, still one click away, and
 * not ~24 chips of noise per integration on the way to anything else.
 */
function Integration({
  row,
  toolInfo,
  blurb,
  essentials,
  advanced,
}: {
  row: Row
  toolInfo: Tools | undefined
  blurb: string
  essentials?: React.ReactNode
  advanced?: React.ReactNode
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  const [adv, setAdv] = useState(false)
  const count = toolInfo?.ok ? toolInfo.tools.length : null
  const live = row.enabled && row.installed

  return (
    <div className={`ws-int${open ? ' is-open' : ''}`}>
      <div className="ws-int-head">
        <button
          type="button"
          className="ws-int-toggle"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
        >
          <span className="ws-int-chev" aria-hidden="true">
            {open ? '▾' : '▸'}
          </span>
          <span className={`settings-dot ${live ? 'dot-ok' : ''}`} aria-hidden="true" />
          <span className="ws-row-name">{row.label}</span>
          {row.mode && (
            <span className="ws-mode">
              {row.mode === 'full' ? 'Full access' : 'Documentation tools only'}
            </span>
          )}
          {/* the count, not the list: enough to know it is alive */}
          <span className="ws-int-count">
            {count === null ? (row.installed ? 'reading…' : 'not set up') : `${count} tools`}
          </span>
        </button>
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

      {open && (
        <div className="ws-int-body">
          <p className="settings-hint">{blurb}</p>
          {essentials}
          <button
            type="button"
            className="ws-adv-toggle"
            aria-expanded={adv}
            onClick={() => setAdv((v) => !v)}
          >
            {adv ? '▾' : '▸'} Advanced
          </button>
          {adv && (
            <div className="ws-adv">
              {toolInfo ? (
                toolInfo.ok ? (
                  <>
                    <p className="settings-hint">
                      Read live from the running server — this cannot drift from what a session
                      actually gets.
                    </p>
                    <ul className="ws-tools">
                      {toolInfo.tools.map((name) => (
                        <li key={name}>{name}</li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p className="ws-tools-err">Could not read tools — {toolInfo.detail}</p>
                )
              ) : row.installed ? (
                <p className="ws-tools-err">Reading tools…</p>
              ) : null}
              {advanced}
            </div>
          )}
        </div>
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
  const test = useWorkspaceMcp((s) => s.test)
  const testing = useWorkspaceMcp((s) => s.testing)
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

  const row = (id: Row['id']): Row | undefined => rows.find((r) => r.id === id)
  const loredex = row('loredex')
  const n8n = row('n8n')
  const langsmith = row('langsmith')

  return (
    <div className="settings-section ws-section">
      <h2 className="settings-title">Integrations</h2>
      <p className="settings-hint">
        These belong to the whole vault — not to one client. Every agent session gets the ones that
        are on. Each card holds everything for that integration: its server, its credentials, its
        skills and its terminal setup.
      </p>

      {loredex && (
        <Integration
          row={loredex}
          toolInfo={tools.loredex}
          blurb="Ours — the dex itself. Search notes, file findings, read and update work items. Always available, nothing to configure."
        />
      )}

      {n8n && (
        <Integration
          row={n8n}
          toolInfo={tools.n8n}
          blurb="The automation platform. Without an API key you get n8n’s documentation and validation tools; with one, workflow creation, execution and analysis too. The key is stored in your OS keychain — never in the vault or a commit."
          essentials={
            <>
              {!n8n.installed && (
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
                  Save
                </Button>
                <Button
                  variant="secondary"
                  disabled={testing}
                  title="Make a real API call to the n8n instance with the stored key"
                  onClick={() => void useWorkspaceMcp.getState().testN8n()}
                >
                  {testing ? 'Testing…' : 'Test connection'}
                </Button>
                {saved && !error && !test && <span className="ws-saved">Saved to your keychain</span>}
                {/* a real round trip: green here means the key actually authenticates */}
                {test && <span className={test.ok ? 'ws-saved' : 'ws-error'}>{test.detail}</span>}
                {error && <span className="ws-error">{error}</span>}
              </div>
            </>
          }
          advanced={
            skills && (
              <>
                <h4 className="ws-adv-title">Skills (Claude only)</h4>
                <p className="settings-hint">
                  Teach Claude n8n’s expression syntax, node configuration and workflow patterns.
                  Codex and Gemini ignore skills — the n8n <em>tools</em> work in all three.
                </p>
                <SetupCard
                  title="n8n skills plugin"
                  note="Run this inside a claude session"
                  command={skills.command}
                  done={skills.installed}
                  launch={skills.launch}
                  onVerify={() => void useWorkspaceMcp.getState().verifySkills()}
                />
                <h4 className="ws-adv-title">In the terminal</h4>
                <p className="settings-hint">
                  The agent panel already has n8n — this is only for{' '}
                  <span className="mono">claude</span> run in a terminal, which reads its own config.
                  <b> Heads up:</b> this command stores your API key in{' '}
                  <span className="mono">~/.claude.json</span> in plain text; the agent panel keeps
                  it in your OS keychain instead. Replace the placeholder with your real key —
                  loredex does not put your stored key into a command.
                </p>
                <SetupCard
                  title="n8n MCP for terminal claude"
                  command={skills.terminal.command}
                  done={skills.terminal.installed}
                  note={verifying ? 'Checking…' : 'Not registered with your claude CLI'}
                  onVerify={() => void useWorkspaceMcp.getState().verifyTerminal()}
                />
              </>
            )
          }
        />
      )}

      {langsmith && <LangsmithIntegration row={langsmith} toolInfo={tools.langsmith} />}
    </div>
  )
}

/**
 * LangSmith — reading the traces the user's OWN agent system writes.
 *
 * Its own component only because it owns three fields and its own test/saved
 * state; one shared `test` slot made an n8n result look like a LangSmith one
 * back when both lived in the same section.
 */
function LangsmithIntegration({
  row,
  toolInfo,
}: {
  row: Row
  toolInfo: Tools | undefined
}): React.JSX.Element {
  const cfg = useWorkspaceMcp((s) => s.langsmith)
  const status = useWorkspaceMcp((s) => s.langsmithStatus)
  const test = useWorkspaceMcp((s) => s.langsmithTest)
  const testing = useWorkspaceMcp((s) => s.langsmithTesting)
  const saved = useWorkspaceMcp((s) => s.langsmithSaved)
  const [key, setKey] = useState('')
  const [endpoint, setEndpoint] = useState('')
  const [project, setProject] = useState('')
  // seed once from what is stored, without clobbering typing — the n8n URL
  // field had exactly this bug (a saved value looked like a failed save)
  const storedUrl = cfg?.url ?? null
  const storedProject = cfg?.project ?? null
  useEffect(() => {
    if (storedUrl) setEndpoint((cur) => (cur === '' ? storedUrl : cur))
  }, [storedUrl])
  useEffect(() => {
    if (storedProject) setProject((cur) => (cur === '' ? storedProject : cur))
  }, [storedProject])

  return (
    <Integration
      row={row}
      toolInfo={toolInfo}
      blurb="Read the traces your own agents write. Paste a conversation link into the agent panel and ask what happened — loredex finds that conversation’s runs by metadata. The MCP server is remote, so nothing is downloaded; it needs an API key from LangSmith → Settings → API keys, stored in your OS keychain."
      essentials={
        <>
          <label className="settings-field ws-field">
            <span>API key</span>
            <input
              className="settings-input"
              type="password"
              placeholder={cfg?.hasKey ? 'Stored — paste a new key to replace it' : 'lsv2_…'}
              value={key}
              onChange={(e) => setKey(e.target.value)}
            />
          </label>
          <label className="settings-field ws-field">
            <span>Endpoint</span>
            <input
              className="settings-input"
              type="url"
              placeholder={cfg?.defaultUrl ?? 'https://api.smith.langchain.com'}
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
            />
          </label>
          <label className="settings-field ws-field">
            <span>Tracing project</span>
            <input
              className="settings-input"
              type="text"
              placeholder={cfg?.defaultProject ?? 'claude-code'}
              value={project}
              onChange={(e) => setProject(e.target.value)}
            />
          </label>
          <p className="settings-hint">
            Blank endpoint = GCP US; EU, APAC, AWS and self-hosted are separate hosts. The project is
            where your agents trace (name or UUID, e.g. <span className="mono">genudo-staging</span>)
            — conversation lookups are scoped to it; blank searches the whole workspace, which works
            but is slower and noisier.
          </p>
          <div className="ws-setup-actions">
            <Button
              variant="primary"
              disabled={!key.trim() && !endpoint.trim() && !project.trim()}
              onClick={() =>
                void useWorkspaceMcp
                  .getState()
                  .saveLangsmith({
                    key: key.trim() || undefined,
                    url: endpoint.trim() || null,
                    project: project.trim() || null,
                  })
                  .then(() => setKey(''))
              }
            >
              Save
            </Button>
            <Button
              variant="secondary"
              disabled={testing || !cfg?.hasKey}
              title="Make a real API call to LangSmith with the stored key"
              onClick={() => void useWorkspaceMcp.getState().testLangsmith()}
            >
              {testing ? 'Testing…' : 'Test connection'}
            </Button>
            {saved && !test && <span className="ws-saved">Saved to your keychain</span>}
            {test && <span className={test.ok ? 'ws-saved' : 'ws-error'}>{test.detail}</span>}
          </div>
        </>
      }
      advanced={
        status && (
          <>
            <h4 className="ws-adv-title">Skills (Claude only)</h4>
            <p className="settings-hint">
              Teach Claude to query traces, build evaluation datasets and write evaluators. Codex and
              Gemini ignore skills — the LangSmith <em>tools</em> work in all three.
            </p>
            <SetupCard
              title="LangSmith skills plugin"
              note="Run this inside a claude session"
              command={status.skills.command}
              done={status.skills.installed}
              launch={status.launch}
              onVerify={() => void useWorkspaceMcp.getState().verifyLangsmith()}
            />
            <h4 className="ws-adv-title">In the terminal</h4>
            <p className="settings-hint">
              The agent panel already has LangSmith — this is only for{' '}
              <span className="mono">claude</span> run in a terminal, which reads its own config.
              <b> Heads up:</b> this command stores your API key in{' '}
              <span className="mono">~/.claude.json</span> in plain text; the agent panel keeps it in
              your OS keychain instead.
            </p>
            <SetupCard
              title="LangSmith MCP for terminal claude"
              command={status.terminal.command}
              done={status.terminal.installed}
              note="Not registered with your claude CLI"
              onVerify={() => void useWorkspaceMcp.getState().verifyLangsmith()}
            />
          </>
        )
      }
    />
  )
}
