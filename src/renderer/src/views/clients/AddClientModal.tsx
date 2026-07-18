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
.acm-input::placeholder { color: var(--text-2); opacity: 0.55; }
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
  source: string
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

  const [name, setName] = useState('')
  const [manager, setManager] = useState('')
  const [tags, setTags] = useState('new-platform')
  // the dex's STANDARD tooling — a new client gets it by default; the team
  // pastes a token, never picks a "client to copy from" (that's bookkeeping,
  // resolved core-side)
  const [connections, setConnections] = useState<Connection[]>([])
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const [tokens, setTokens] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    void invoke('clients.standardTooling', undefined)
      .then((list) => {
        setConnections(list)
        setChecked(new Set(list.map((c) => c.server)))
      })
      .catch(() => {
        setConnections([])
        setChecked(new Set())
      })
  }, [])

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
      // group checked connections by copy source (usually one across a fleet);
      // the first source rides clients.create, the rest apply post-create
      const active = connections.filter((c) => checked.has(c.server))
      const bySource = new Map<string, Connection[]>()
      for (const c of active) bySource.set(c.source, [...(bySource.get(c.source) ?? []), c])
      const sources = [...bySource.entries()].sort((a, b) => b[1].length - a[1].length)
      const tokensFor = (list: Connection[]): Record<string, string> => {
        const refs = new Set(list.flatMap((c) => c.envRefs))
        return Object.fromEntries(
          Object.entries(tokens).filter(([ref, v]) => refs.has(ref) && v.trim()),
        )
      }
      const [primary, ...rest] = sources
      const { slug } = await invoke('clients.create', {
        spec: {
          name: name.trim(),
          manager: manager.trim(),
          tags: tags.split(',').map((t) => t.trim()).filter(Boolean),
          fromClient: primary?.[0],
          servers: primary ? primary[1].map((c) => c.server) : undefined,
        },
        tokens: primary ? tokensFor(primary[1]) : {},
        identity,
      })
      for (const [from, list] of rest) {
        await invoke('clients.tooling.copy', {
          client: slug,
          from,
          servers: list.map((c) => c.server),
          tokens: tokensFor(list),
          identity,
        })
      }
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
            placeholder="client name"
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
      {connections.length > 0 && (
        <div className="acm-field">
          <span className="modal-label">
            {connections.length === 1 ? 'Connection' : 'Connections'}
          </span>
          {connections.map((conn) => (
            <div key={conn.server} className="acm-conn">
              {connections.length === 1 ? (
                <span className="acm-conn-name">{conn.server}</span>
              ) : (
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
              )}
              {checked.has(conn.server) &&
                conn.envRefs.map((ref) => (
                  <label key={ref} className="acm-conn-token">
                    <input
                      className="acm-input"
                      type="password"
                      value={tokens[ref] ?? ''}
                      onChange={(e) => setTokens({ ...tokens, [ref]: e.target.value })}
                      placeholder="Paste this client's token (stored in your OS keychain, never in git)"
                    />
                  </label>
                ))}
            </div>
          ))}
        </div>
      )}
    </Modal>
  )
}
