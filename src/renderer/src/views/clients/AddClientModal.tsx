/**
 * Add Client (docs/plan/agent-ops-desktop-flow.md): the terminal-free path —
 * name + manager + connection tokens in one modal, `clients.create` wires
 * everything (scaffold, golden workspace copy, keychain, materialize, one
 * commit). Tokens are keyed by the GOLDEN client's env-ref names; the core
 * translates them through the copy's rename map — the renderer never guesses
 * a slug.
 */
import { useEffect, useMemo, useState } from 'react'
import { invoke } from '../../api'
import { Modal } from '../../components/Modal'
import { effectiveIdentity, useIdentity } from '../../stores/identity'
import { useDex } from '../../stores/dex'

const MODAL_CSS = `
.acm-field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 12px; }
.acm-row { display: flex; gap: 10px; }
.acm-row .acm-field { flex: 1; }
.acm-input {
  font-size: 13px; color: var(--text-1); background: var(--bg-inset);
  border: 1px solid var(--hairline); border-radius: 8px; padding: 7px 10px;
}
.acm-input:focus { outline: none; border-color: var(--accent); }
.acm-conn { border: 1px solid var(--hairline); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px; }
.acm-conn-head { display: flex; align-items: center; gap: 8px; }
.acm-conn-name { font-family: var(--font-mono); font-size: 12px; color: var(--text-1); flex: 1; }
.acm-conn-ref { font-family: var(--font-mono); font-size: 10.5px; color: var(--text-2); }
.acm-conn-token { margin-top: 6px; }
.acm-conn-token input { width: 100%; }
.acm-hint { font-size: 11.5px; color: var(--text-2); }
.acm-error { font-size: 12px; color: var(--rust, #a33f2e); margin-bottom: 8px; }
`

interface Connection {
  server: string
  envRefs: string[]
}

export function AddClientModal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const fleet = useDex((s) => s.fleet) ?? []
  const refreshFleet = useDex((s) => s.refreshFleet)
  const selectClient = useDex((s) => s.selectClient)
  const identity = useIdentity((s) => effectiveIdentity(s))

  const managers = useMemo(
    () => [...new Set(fleet.map((c) => c.manager).filter((m): m is string => Boolean(m)))].sort(),
    [fleet],
  )
  const goldens = useMemo(() => fleet.filter((c) => c.hasWorkspaceYml).map((c) => c.slug), [fleet])

  const [name, setName] = useState('')
  const [manager, setManager] = useState('')
  const [tags, setTags] = useState('new-platform')
  const [golden, setGolden] = useState<string>('')
  const [connections, setConnections] = useState<Connection[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // default golden: first tooled client — connections load whenever it changes
  useEffect(() => {
    if (!golden && goldens.length > 0) setGolden(goldens[0] ?? '')
  }, [golden, goldens])
  useEffect(() => {
    if (!golden) {
      setConnections([])
      setChecked(new Set())
      return
    }
    void invoke('clients.connections', { client: golden })
      .then((conns) => {
        // a golden client may declare no connections — that's an empty, valid list
        setConnections(conns)
        setChecked(new Set(conns.map((c) => c.server)))
      })
      .catch(() => {
        setConnections([])
        setChecked(new Set())
      })
  }, [golden])

  const blockedReason = !name.trim()
    ? 'client name is required'
    : !manager.trim()
      ? 'pick a manager'
      : identity === null
        ? 'set your name and email in Settings first'
        : null

  async function submit(): Promise<void> {
    if (blockedReason || identity === null || busy) return
    setBusy(true)
    setError(null)
    try {
      const servers = [...checked]
      const activeRefs = new Set(
        connections.filter((c) => checked.has(c.server)).flatMap((c) => c.envRefs),
      )
      const { slug } = await invoke('clients.create', {
        spec: {
          name: name.trim(),
          manager: manager.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          fromClient: golden || undefined,
          servers: golden && servers.length < connections.length ? servers : undefined,
        },
        tokens: Object.fromEntries(
          Object.entries(tokens).filter(([ref, v]) => activeRefs.has(ref) && v.trim()),
        ),
        identity,
      })
      await refreshFleet()
      selectClient(slug)
      onClose()
    } catch (e) {
      setError(String((e as { message?: string }).message ?? e))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      title="Add client"
      onClose={onClose}
      onSubmit={() => void submit()}
      submitLabel={busy ? 'Creating…' : 'Create client'}
      submitDisabled={Boolean(blockedReason) || busy}
      submitBlockedReason={blockedReason}
    >
      <style>{MODAL_CSS}</style>
      {error && <div className="acm-error">✗ {error}</div>}
      <div className="acm-row">
        <label className="acm-field">
          <span className="modal-label">Name</span>
          <input
            className="acm-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="BrightSmile Dental"
          />
        </label>
        <label className="acm-field">
          <span className="modal-label">Manager</span>
          <input
            className="acm-input"
            list="acm-managers"
            value={manager}
            onChange={(e) => setManager(e.target.value)}
            placeholder="pick or type"
          />
          <datalist id="acm-managers">
            {managers.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="acm-field">
        <span className="modal-label">Tags</span>
        <input
          className="acm-input"
          value={tags}
          onChange={(e) => setTags(e.target.value)}
          placeholder="new-platform, dental"
        />
      </label>
      <label className="acm-field">
        <span className="modal-label">Copy tooling from</span>
        <select className="acm-input" value={golden} onChange={(e) => setGolden(e.target.value)}>
          <option value="">none — empty workspace</option>
          {goldens.map((slug) => (
            <option key={slug} value={slug}>
              {slug}
            </option>
          ))}
        </select>
      </label>
      {connections.length > 0 && (
        <div className="acm-field">
          <span className="modal-label">Connections</span>
          {connections.map((conn) => (
            <div key={conn.server} className="acm-conn">
              <label className="acm-conn-head">
                <input
                  type="checkbox"
                  checked={checked.has(conn.server)}
                  onChange={(e) => {
                    const next = new Set(checked)
                    if (e.target.checked) next.add(conn.server)
                    else next.delete(conn.server)
                    setChecked(next)
                  }}
                />
                <span className="acm-conn-name">{conn.server}</span>
              </label>
              {checked.has(conn.server) &&
                conn.envRefs.map((ref) => (
                  <label key={ref} className="acm-conn-token">
                    <span className="acm-conn-ref">{ref} → this client's token</span>
                    <input
                      className="acm-input"
                      type="password"
                      value={tokens[ref] ?? ''}
                      onChange={(e) => setTokens({ ...tokens, [ref]: e.target.value })}
                      placeholder="paste token (stored in your OS keychain, never in git)"
                    />
                  </label>
                ))}
            </div>
          ))}
          <span className="acm-hint">
            Tokens stay on this machine (OS keychain) and land only in the client's gitignored
            generated files.
          </span>
        </div>
      )}
    </Modal>
  )
}
